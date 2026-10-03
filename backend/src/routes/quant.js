'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { withSymbol } = require('./schemas');
const { periodsPerYear } = require('../services/quant/metrics');
const { describe, getStrategy, resolveParams } = require('../services/quant/strategies');
const { evaluateStrategy, optimizeStrategy, walkForward } = require('../services/quant/research');
const { alignReturns, riskReport } = require('../services/quant/risk');
const { optimize, METHODS } = require('../services/quant/optimizer');
const { scanAsset, rankAssets } = require('../services/quant/scanner');
const { toUnits } = require('../utils/money');
const { badRequest, unprocessable } = require('../utils/httpError');

const MAX_ASSETS = 25;
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

const backtestSchema = withSymbol({
    strategy: z.string().trim().min(1).max(40),
    params: z.record(z.string().max(20), z.number()).default({}),
    mode: z.enum(['evaluate', 'optimize', 'walk_forward']).default('evaluate'),
    split: z.number().min(0.5).max(0.9).default(0.7),
    initialCapital: z.number().min(100).max(1e9).default(10_000),
    commissionBps: z.number().min(0).max(200).optional(),
    slippageBps: z.number().min(0).max(200).optional(),
    trainBars: z.number().int().min(60).max(2000).optional(),
    testBars: z.number().int().min(20).max(500).optional(),
});

// Realistic defaults for a retail trader: ~0.1% all-in per side for stocks, ~0.2% for crypto.
const defaultCosts = (assetType) => (assetType === 'crypto' ? { commissionBps: 10, slippageBps: 10 } : { commissionBps: 5, slippageBps: 5 });

/** Loads daily history for several assets one after another (kind to provider rate limits). */
async function loadHistories(market, items) {
    const ok = [];
    const failed = [];
    for (const item of items) {
        try {
            const history = await market.getDailyCandles(item.assetType, item.symbol);
            ok.push({ ...item, history, candles: history.candles });
        } catch (err) {
            failed.push({ symbol: item.symbol, assetType: item.assetType, error: err.message });
        }
    }
    return { ok, failed };
}

const uniqueItems = (items) => {
    const seen = new Set();
    return items.filter((i) => {
        const key = `${i.assetType}:${i.symbol}`;
        return seen.has(key) ? false : seen.add(key);
    });
};

function quantRouter({ db, market, quantLimiter }) {
    const router = express.Router();

    async function userHoldings(userId) {
        const [rows] = await db.execute(
            'SELECT symbol, asset_type, quantity, average_cost, currency, realized_pnl FROM holdings WHERE user_id = ? AND quantity > 0 ORDER BY asset_type, symbol',
            [userId]
        );
        return rows.filter((h) => toUnits(h.quantity) > 0n);
    }

    async function userWatchlist(userId) {
        const [rows] = await db.execute('SELECT symbol, asset_type FROM watchlist_items WHERE user_id = ? ORDER BY created_at, id', [userId]);
        return rows.map((r) => ({ symbol: r.symbol, assetType: r.asset_type }));
    }

    /** Current market value of each open holding, converted into `currency`. */
    async function holdingValues(holdings, currency) {
        const values = [];
        const skipped = [];
        for (const type of ['stock', 'crypto']) {
            const list = holdings.filter((h) => h.asset_type === type);
            if (!list.length) continue;
            const { quotes, errors } = await market.getQuotes(type, list.map((h) => h.symbol));
            for (const h of list) {
                const quote = quotes.get(h.symbol);
                if (!quote) {
                    skipped.push({ symbol: h.symbol, reason: errors.get(h.symbol) ?? 'Quote unavailable' });
                    continue;
                }
                try {
                    const rate = await market.fxRate(h.currency, currency);
                    values.push({ symbol: h.symbol, assetType: type, price: quote.price, priceCurrency: h.currency, quantity: Number(h.quantity), value: Number(h.quantity) * quote.price * rate, rate });
                } catch (err) {
                    skipped.push({ symbol: h.symbol, reason: `No ${h.currency}→${currency} exchange rate` });
                }
            }
        }
        return { values, skipped };
    }

    router.get('/strategies', (_req, res) => {
        res.json({ strategies: describe(), optimizers: Object.entries(METHODS).map(([id, label]) => ({ id, label })) });
    });

    router.post('/backtest', quantLimiter, validate({ body: backtestSchema }), async (req, res) => {
        const body = req.valid.body;
        const strategy = getStrategy(body.strategy);
        const history = await market.getDailyCandles(body.assetType, body.symbol);
        const ppy = periodsPerYear(body.assetType);
        const defaults = defaultCosts(body.assetType);
        const costs = {
            initialCash: body.initialCapital,
            commissionBps: body.commissionBps ?? defaults.commissionBps,
            slippageBps: body.slippageBps ?? defaults.slippageBps,
            rebalanceBand: 0.1,
        };
        const base = { candles: history.candles, strategy, ppy, costs };

        let result;
        if (body.mode === 'walk_forward') {
            result = walkForward({ ...base, trainBars: body.trainBars, testBars: body.testBars });
        } else if (body.mode === 'optimize') {
            result = optimizeStrategy({ ...base, split: body.split });
        } else {
            result = evaluateStrategy({ ...base, params: resolveParams(strategy, body.params), split: body.split });
        }
        res.json({
            symbol: history.symbol ?? body.symbol,
            requestedSymbol: body.symbol,
            assetType: body.assetType,
            currency: history.currency,
            source: history.source,
            note: history.note ?? null,
            mode: body.mode,
            costs: { commissionBps: costs.commissionBps, slippageBps: costs.slippageBps },
            ...result,
            disclaimer: 'Historical simulation, not a prediction. Past performance does not guarantee future results; not investment advice.',
        });
    });

    router.get(
        '/risk',
        quantLimiter,
        validate({ query: z.object({ currency: currencyCode.default('USD'), benchmark: z.string().trim().toUpperCase().max(20).optional() }) }),
        async (req, res) => {
            const { currency, benchmark } = req.valid.query;
            const holdings = await userHoldings(req.user.id);
            if (!holdings.length) throw unprocessable('Record at least one open position to analyse portfolio risk.');
            if (holdings.length > MAX_ASSETS) throw unprocessable(`Risk analysis supports up to ${MAX_ASSETS} positions.`);

            const { values, skipped } = await holdingValues(holdings, currency);
            const { ok, failed } = await loadHistories(market, values.map((v) => ({ symbol: v.symbol, assetType: v.assetType })));
            const usable = values.filter((v) => ok.some((o) => o.symbol === v.symbol && o.assetType === v.assetType));
            if (!usable.length) throw unprocessable('No price history could be loaded for your positions right now.');

            let benchHistory = null;
            if (benchmark) {
                try {
                    benchHistory = await market.getDailyCandles('stock', benchmark);
                } catch (err) {
                    failed.push({ symbol: benchmark, assetType: 'stock', error: err.message });
                }
            }

            const total = usable.reduce((s, v) => s + v.value, 0);
            const histories = usable.map((v) => ({ symbol: v.symbol, candles: ok.find((o) => o.symbol === v.symbol && o.assetType === v.assetType).candles }));
            if (benchHistory) histories.push({ symbol: `__benchmark__`, candles: benchHistory.candles });
            const aligned = alignReturns(histories);
            const benchmarkReturns = benchHistory ? aligned.returns.pop() : null;
            const hasStock = usable.some((v) => v.assetType === 'stock');
            const report = riskReport({
                assets: usable.map((v) => ({ symbol: v.symbol, weight: v.value / total })),
                returns: aligned.returns,
                dates: aligned.dates,
                ppy: hasStock ? 252 : 365,
                benchmarkReturns,
            });
            res.json({
                currency,
                totalValue: total,
                benchmark: benchHistory ? benchmark : null,
                ...report,
                skipped: [...skipped, ...failed],
                notes: [
                    'Risk is estimated from historical daily returns and assumes constant weights; it can understate risk in a crisis.',
                    'Weights use today\'s exchange rates; holdings in other currencies are not adjusted for currency moves in the return history.',
                ],
            });
        }
    );

    router.get(
        '/optimize',
        quantLimiter,
        validate({
            query: z.object({
                method: z.enum(Object.keys(METHODS)).default('risk_parity'),
                maxWeight: z.coerce.number().min(0.05).max(1).default(0.4),
                currency: currencyCode.default('USD'),
                include: z.enum(['holdings', 'watchlist']).default('holdings'),
            }),
        }),
        async (req, res) => {
            const { method, maxWeight, currency, include } = req.valid.query;
            const holdings = await userHoldings(req.user.id);
            const { values, skipped } = await holdingValues(holdings, currency);
            const universe = values.map((v) => ({ symbol: v.symbol, assetType: v.assetType }));
            if (include === 'watchlist') universe.push(...(await userWatchlist(req.user.id)));
            const items = uniqueItems(universe).slice(0, MAX_ASSETS);
            if (items.length < 2) throw unprocessable('Optimisation needs at least two assets: hold two or more positions, or include your watchlist.');

            const { ok, failed } = await loadHistories(market, items);
            if (ok.length < 2) throw unprocessable('Price history could not be loaded for at least two assets right now.');
            const aligned = alignReturns(ok.map((o) => ({ symbol: o.symbol, candles: o.candles })));
            const ppy = ok.some((o) => o.assetType === 'stock') ? 252 : 365;
            const result = optimize({ returns: aligned.returns, ppy, method, maxWeight });

            const valueOf = (o) => values.find((v) => v.symbol === o.symbol && v.assetType === o.assetType);
            const totalValue = ok.reduce((s, o) => s + (valueOf(o)?.value ?? 0), 0);
            const rows = ok.map((o, i) => {
                const held = valueOf(o);
                const currentValue = held?.value ?? 0;
                const targetValue = totalValue > 0 ? result.weights[i] * totalValue : null;
                return {
                    symbol: o.symbol,
                    assetType: o.assetType,
                    currentWeight: totalValue > 0 ? currentValue / totalValue : 0,
                    targetWeight: result.weights[i],
                    riskShare: result.riskShares[i],
                    currentValue,
                    targetValue,
                    changeValue: targetValue === null ? null : targetValue - currentValue,
                    inPortfolio: Boolean(held),
                };
            });
            res.json({
                method: result.method,
                label: result.label,
                currency,
                maxWeight,
                totalValue,
                expected: { return: result.expectedReturn, vol: result.expectedVol, sharpe: result.expectedSharpe },
                period: { from: aligned.dates[0], to: aligned.dates[aligned.dates.length - 1], days: aligned.dates.length },
                assets: rows,
                skipped: [...skipped, ...failed],
                notes: [
                    'Weights are computed from past returns with shrinkage; expected figures are estimates, not forecasts.',
                    'Optimised portfolios are sensitive to the input period. Treat the result as a diversification guide, not as a trading instruction.',
                ],
            });
        }
    );

    router.get(
        '/scan',
        quantLimiter,
        validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(MAX_ASSETS).default(15) }) }),
        async (req, res) => {
            const holdings = await userHoldings(req.user.id);
            const watch = await userWatchlist(req.user.id);
            const items = uniqueItems([...watch, ...holdings.map((h) => ({ symbol: h.symbol, assetType: h.asset_type }))]).slice(0, req.valid.query.limit);
            if (!items.length) throw unprocessable('Add assets to your watchlist or portfolio to scan them.');
            const { ok, failed } = await loadHistories(market, items);
            if (!ok.length) throw badRequest(failed[0]?.error ?? 'No price history could be loaded.');
            const rows = ok.map((o) => ({
                symbol: o.symbol,
                assetType: o.assetType,
                currency: o.history.currency,
                held: holdings.some((h) => h.symbol === o.symbol && h.asset_type === o.assetType),
                ...scanAsset(o.candles, periodsPerYear(o.assetType)),
            }));
            res.json({
                assets: rankAssets(rows),
                failed,
                note: 'The score averages momentum ranks, trend agreement and low volatility. It describes recent behaviour and does not predict returns.',
            });
        }
    );

    return router;
}

module.exports = { quantRouter };
