'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { withSymbol } = require('./schemas');
const { conflict, notFound, unprocessable } = require('../utils/httpError');

const MAX_ITEMS = 50;

function watchlistRouter({ db, market }) {
    const router = express.Router();

    router.get('/', validate({ query: z.object({ quotes: z.enum(['true', 'false']).default('true') }) }), async (req, res) => {
        const [rows] = await db.execute(
            'SELECT id, symbol, asset_type, created_at FROM watchlist_items WHERE user_id = ? ORDER BY created_at, id',
            [req.user.id]
        );
        const items = rows.map((r) => ({ id: Number(r.id), symbol: r.symbol, assetType: r.asset_type, addedAt: r.created_at, quote: null, quoteError: null }));
        if (req.valid.query.quotes === 'true') {
            for (const type of ['stock', 'crypto']) {
                const list = items.filter((i) => i.assetType === type);
                if (!list.length) continue;
                const { quotes, errors } = await market.getQuotes(type, list.map((i) => i.symbol));
                for (const item of list) {
                    item.quote = quotes.get(item.symbol) ?? null;
                    item.quoteError = errors.get(item.symbol) ?? null;
                }
            }
        }
        res.json({ items });
    });

    router.post('/', validate({ body: withSymbol() }), async (req, res) => {
        const { assetType, symbol } = req.valid.body;
        const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM watchlist_items WHERE user_id = ?', [req.user.id]);
        if (Number(count) >= MAX_ITEMS) throw unprocessable(`Watchlist is limited to ${MAX_ITEMS} items`);
        // Make sure the symbol exists before saving it (also warms the quote cache).
        await market.getQuote(assetType, symbol);
        try {
            const [result] = await db.execute(
                'INSERT INTO watchlist_items (user_id, symbol, asset_type) VALUES (?, ?, ?)',
                [req.user.id, symbol, assetType]
            );
            res.status(201).json({ item: { id: Number(result.insertId), symbol, assetType } });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') throw conflict(`${symbol} is already on your watchlist`);
            throw err;
        }
    });

    router.delete('/:assetType/:symbol', validate({ params: withSymbol() }), async (req, res) => {
        const { assetType, symbol } = req.valid.params;
        const [result] = await db.execute(
            'DELETE FROM watchlist_items WHERE user_id = ? AND asset_type = ? AND symbol = ?',
            [req.user.id, assetType, symbol]
        );
        if (!result.affectedRows) throw notFound(`${symbol} is not on your watchlist`);
        res.status(204).end();
    });

    return router;
}

module.exports = { watchlistRouter };
