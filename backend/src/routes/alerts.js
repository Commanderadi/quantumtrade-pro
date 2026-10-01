'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { withSymbol, signedDecimal, decimal, id } = require('./schemas');
const { checkAlerts } = require('../services/alerts');
const { notFound, unprocessable, badRequest } = require('../utils/httpError');

const MAX_ALERTS = 100;
const condition = z.enum(['price_above', 'price_below', 'change_pct_above', 'change_pct_below']);

const createSchema = withSymbol({ condition, targetValue: signedDecimal }).superRefine((v, ctx) => {
    if (v.condition.startsWith('price_') && !decimal().safeParse(v.targetValue).success) {
        ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'Target price must be greater than 0' });
    }
});

const updateSchema = z
    .object({ condition: condition.optional(), targetValue: signedDecimal.optional(), isActive: z.boolean().optional() })
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const serialize = (a) => ({
    id: Number(a.id),
    symbol: a.symbol,
    assetType: a.asset_type,
    condition: a.condition,
    targetValue: a.target_value,
    isActive: Boolean(a.is_active),
    triggeredAt: a.triggered_at,
    triggeredValue: a.triggered_value,
    lastCheckedAt: a.last_checked_at,
    createdAt: a.created_at,
});

function alertsRouter({ db, market, logger, alertCheckLimiter }) {
    const router = express.Router();

    const findAlert = async (alertId, userId) => {
        const [[row]] = await db.execute('SELECT * FROM alerts WHERE id = ? AND user_id = ?', [alertId, userId]);
        if (!row) throw notFound('Alert not found');
        return row;
    };

    router.get('/', async (req, res) => {
        const [rows] = await db.execute('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC, id DESC', [req.user.id]);
        res.json({ alerts: rows.map(serialize) });
    });

    router.post('/', validate({ body: createSchema }), async (req, res) => {
        const { assetType, symbol, condition: cond, targetValue } = req.valid.body;
        const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM alerts WHERE user_id = ?', [req.user.id]);
        if (Number(count) >= MAX_ALERTS) throw unprocessable(`You can have at most ${MAX_ALERTS} alerts`);
        await market.getQuote(assetType, symbol); // validates the symbol exists
        const [result] = await db.execute(
            'INSERT INTO alerts (user_id, symbol, asset_type, `condition`, target_value) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, symbol, assetType, cond, targetValue]
        );
        res.status(201).json({ alert: serialize(await findAlert(result.insertId, req.user.id)) });
    });

    router.patch('/:id', validate({ params: z.object({ id }), body: updateSchema }), async (req, res) => {
        const current = await findAlert(req.valid.params.id, req.user.id);
        const next = {
            condition: req.valid.body.condition ?? current.condition,
            targetValue: req.valid.body.targetValue ?? current.target_value,
            isActive: req.valid.body.isActive ?? Boolean(current.is_active),
        };
        if (next.condition.startsWith('price_') && !(Number(next.targetValue) > 0)) throw badRequest('Target price must be greater than 0');
        // Re-arming an alert clears its previous trigger.
        const rearm = next.isActive && !current.is_active;
        await db.execute(
            `UPDATE alerts SET \`condition\` = ?, target_value = ?, is_active = ?
                ${rearm ? ', triggered_at = NULL, triggered_value = NULL' : ''}
              WHERE id = ? AND user_id = ?`,
            [next.condition, next.targetValue, next.isActive ? 1 : 0, current.id, req.user.id]
        );
        res.json({ alert: serialize(await findAlert(current.id, req.user.id)) });
    });

    router.delete('/:id', validate({ params: z.object({ id }) }), async (req, res) => {
        const [result] = await db.execute('DELETE FROM alerts WHERE id = ? AND user_id = ?', [req.valid.params.id, req.user.id]);
        if (!result.affectedRows) throw notFound('Alert not found');
        res.status(204).end();
    });

    // On-demand check of the current user's alerts (the scheduler also runs in the background).
    router.post('/check', alertCheckLimiter, async (req, res) => {
        const result = await checkAlerts({ db, market, logger: req.log ?? logger, userId: req.user.id });
        const [rows] = await db.execute('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC, id DESC', [req.user.id]);
        res.json({ ...result, alerts: rows.map(serialize) });
    });

    return router;
}

module.exports = { alertsRouter };
