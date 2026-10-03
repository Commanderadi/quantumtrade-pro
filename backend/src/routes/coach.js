'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { withSymbol } = require('./schemas');
const { detectBehaviours, reasonScoreboard } = require('../services/coach/insights');
const { LESSONS, getLesson } = require('../services/coach/lessons');

const REASONS = ['research', 'chart', 'news', 'tip', 'gut', 'rebalance', 'take_profit', 'stop_loss', 'other'];

const orderSchema = withSymbol({
    side: z.enum(['buy', 'sell']),
    quantity: z.number().positive().max(1e9).optional(),
    amount: z.number().positive().max(1e10).optional(),
    all: z.boolean().optional(),
    reason: z.enum(REASONS),
    confidence: z.number().int().min(1).max(5).optional(),
    note: z.string().trim().max(500).optional(),
}).superRefine((o, ctx) => {
    const given = [o.quantity !== undefined, o.amount !== undefined, o.all === true].filter(Boolean).length;
    if (given !== 1) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Give exactly one of quantity, amount or all' });
    if (o.side === 'sell' && o.amount !== undefined) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Sell by quantity or sell all' });
    if (o.side === 'buy' && o.all) ctx.addIssue({ code: 'custom', path: ['all'], message: '"all" only applies to sells' });
    if (o.quantity !== undefined && !/^\d+(\.\d{1,8})?$/.test(String(o.quantity))) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'At most 8 decimal places' });
});

const publicSummary = ({ priceBySymbol: _p, lots: _l, ...rest }) => rest;

function coachRouter({ coach, quantLimiter }) {
    const router = express.Router();

    router.get('/account', async (req, res) => {
        res.json(publicSummary(await coach.summary(req.user.id)));
    });

    router.post('/orders', quantLimiter, validate({ body: orderSchema }), async (req, res) => {
        const result = await coach.placeOrder(req.user.id, req.valid.body);
        res.status(201).json(result);
    });

    router.get('/trades', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }) }), async (req, res) => {
        res.json({ trades: await coach.loadTrades(req.user.id, req.valid.query.limit) });
    });

    router.get('/insights', async (req, res) => {
        const s = await coach.summary(req.user.id);
        const trades = (await coach.loadTrades(req.user.id)).reverse();
        const behaviours = detectBehaviours({
            trades,
            lots: s.lots,
            positions: s.positions.filter((p) => p.value !== null),
            account: { startingCash: s.account.startingCash, totalValue: s.account.totalValue, mirrorValue: s.mirror.value, mirrorComplete: s.mirror.complete && s.mirror.available },
        });
        const lessonIds = [...new Set([...(trades.length < 3 ? ['start_here'] : []), ...behaviours.map((b) => b.lesson)])];
        res.json({
            behaviours,
            reasons: reasonScoreboard(s.lots, s.priceBySymbol),
            lessons: lessonIds.map(getLesson).filter(Boolean),
        });
    });

    router.get('/lessons', (_req, res) => res.json({ lessons: LESSONS }));

    router.post('/reset', validate({ body: z.object({ currency: z.enum(['INR', 'USD']).optional(), confirm: z.literal(true) }) }), async (req, res) => {
        await coach.reset(req.user.id, req.valid.body);
        res.json(publicSummary(await coach.summary(req.user.id)));
    });

    return router;
}

module.exports = { coachRouter, REASONS };
