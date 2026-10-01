'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { assetType, withSymbol, decimal, id, rawSymbol } = require('./schemas');
const { withTransaction } = require('../db/pool');
const { lockUser, rebuildHolding, valuePortfolio } = require('../services/portfolio');
const { stockCurrency } = require('../services/marketData');
const { notFound, unprocessable } = require('../utils/httpError');

const transactionSchema = withSymbol({
    side: z.enum(['buy', 'sell']),
    quantity: decimal(),
    price: decimal({ allowZero: true }),
    fee: decimal({ allowZero: true }).default('0'),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code').optional(),
    executedAt: z.coerce.date().optional(),
    note: z.string().trim().max(255).optional(),
});

const listSchema = z.object({
    assetType: assetType.optional(),
    symbol: rawSymbol.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
});

const serializeTx = (t) => ({
    id: Number(t.id),
    symbol: t.symbol,
    assetType: t.asset_type,
    side: t.side,
    quantity: t.quantity,
    price: t.price,
    fee: t.fee,
    currency: t.currency,
    realizedPnl: t.realized_pnl,
    note: t.note,
    executedAt: t.executed_at,
    createdAt: t.created_at,
});

function portfolioRouter({ db, market }) {
    const router = express.Router();

    router.get('/', validate({ query: z.object({ currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional() }) }), async (req, res) => {
        const [holdings] = await db.execute(
            'SELECT symbol, asset_type, quantity, average_cost, currency, realized_pnl FROM holdings WHERE user_id = ? ORDER BY asset_type, symbol',
            [req.user.id]
        );
        res.json(await valuePortfolio(holdings, market, req.valid.query.currency ?? null));
    });

    router.get('/transactions', validate({ query: listSchema }), async (req, res) => {
        const { assetType: type, symbol, limit, offset } = req.valid.query;
        const where = ['user_id = ?'];
        const params = [req.user.id];
        if (type) { where.push('asset_type = ?'); params.push(type); }
        if (symbol) { where.push('symbol = ?'); params.push(symbol); }
        const [rows] = await db.query(
            `SELECT * FROM transactions WHERE ${where.join(' AND ')} ORDER BY executed_at DESC, id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM transactions WHERE ${where.join(' AND ')}`, params);
        res.json({ transactions: rows.map(serializeTx), total: Number(total), limit, offset });
    });

    router.post('/transactions', validate({ body: transactionSchema }), async (req, res) => {
        const body = req.valid.body;
        const executedAt = body.executedAt ?? new Date();
        if (executedAt.getTime() > Date.now() + 60_000) throw unprocessable('Trade date cannot be in the future');

        const currency = body.currency ?? (body.assetType === 'crypto' ? 'USD' : stockCurrency(body.symbol));

        const created = await withTransaction(db, async (conn) => {
            await lockUser(conn, req.user.id);
            const [existing] = await conn.execute(
                'SELECT currency FROM transactions WHERE user_id = ? AND asset_type = ? AND symbol = ? LIMIT 1',
                [req.user.id, body.assetType, body.symbol]
            );
            if (existing.length && existing[0].currency !== currency) {
                throw unprocessable(`${body.symbol} is already recorded in ${existing[0].currency}; use the same currency`);
            }
            const [result] = await conn.execute(
                `INSERT INTO transactions (user_id, symbol, asset_type, side, quantity, price, fee, currency, note, executed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.user.id, body.symbol, body.assetType, body.side, body.quantity, body.price, body.fee, currency, body.note ?? null, executedAt]
            );
            // Rebuilding validates the whole history (e.g. a back-dated sell can't oversell).
            await rebuildHolding(conn, req.user.id, body.assetType, body.symbol);
            const [[row]] = await conn.execute('SELECT * FROM transactions WHERE id = ?', [result.insertId]);
            return row;
        });
        res.status(201).json({ transaction: serializeTx(created) });
    });

    router.delete('/transactions/:id', validate({ params: z.object({ id }) }), async (req, res) => {
        await withTransaction(db, async (conn) => {
            await lockUser(conn, req.user.id);
            const [[tx]] = await conn.execute('SELECT asset_type, symbol FROM transactions WHERE id = ? AND user_id = ?', [req.valid.params.id, req.user.id]);
            if (!tx) throw notFound('Transaction not found');
            await conn.execute('DELETE FROM transactions WHERE id = ?', [req.valid.params.id]);
            // Fails (and rolls back) if removing a buy would leave a later sell uncovered.
            await rebuildHolding(conn, req.user.id, tx.asset_type, tx.symbol);
        });
        res.status(204).end();
    });

    return router;
}

module.exports = { portfolioRouter };
