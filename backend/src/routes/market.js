'use strict';

const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { assetType, withSymbol, rawSymbol, CRYPTO_SYMBOL } = require('./schemas');
const { analyze } = require('../services/indicators');
const { badRequest } = require('../utils/httpError');

function marketRouter({ market }) {
    const router = express.Router();

    router.get('/quote/:assetType/:symbol', validate({ params: withSymbol() }), async (req, res) => {
        const { assetType: type, symbol } = req.valid.params;
        res.json({ quote: await market.getQuote(type, symbol) });
    });

    router.get(
        '/search',
        validate({ query: z.object({ assetType, q: z.string().trim().min(1).max(50) }) }),
        async (req, res) => {
            const { assetType: type, q } = req.valid.query;
            res.json({ results: await market.search(type, q) });
        }
    );

    router.get(
        '/crypto/top',
        validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
        async (req, res) => {
            res.json({ coins: await market.topCryptos(req.valid.query.limit) });
        }
    );

    router.get('/crypto/:symbol/info', validate({ params: z.object({ symbol: rawSymbol }) }), async (req, res) => {
        const { symbol } = req.valid.params;
        if (!CRYPTO_SYMBOL.test(symbol)) throw badRequest('Invalid crypto symbol');
        res.json({ info: await market.cryptoInfo(symbol) });
    });

    router.get('/indices', async (_req, res) => {
        res.json({ indices: await market.indices() });
    });

    router.get(
        '/fx',
        validate({
            query: z.object({
                from: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
                to: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
            }),
        }),
        async (req, res) => {
            const { from, to } = req.valid.query;
            res.json({ from, to, rate: await market.fxRate(from, to), source: 'CoinGecko' });
        }
    );

    // Daily candles with technical indicators and a rule-based signal summary.
    router.get('/analysis/:assetType/:symbol', validate({ params: withSymbol() }), async (req, res) => {
        const { assetType: type, symbol } = req.valid.params;
        const history = await market.getDailyCandles(type, symbol);
        const { series, summary } = analyze(history.candles);
        res.json({
            symbol: history.symbol ?? symbol,
            requestedSymbol: symbol,
            note: history.note ?? null,
            assetType: type,
            currency: history.currency,
            source: history.source,
            approximateOhlc: history.approximateOhlc,
            series,
            summary,
            disclaimer: 'Rule-based technical indicators for information only. Not investment advice.',
        });
    });

    return router;
}

module.exports = { marketRouter };
