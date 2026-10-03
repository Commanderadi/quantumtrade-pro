'use strict';

const mysql = require('mysql2/promise');
const supertest = require('supertest');
const { loadEnv } = require('../../src/config/env');
const { createPool } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const { createLogger } = require('../../src/logger');
const { notFound } = require('../../src/utils/httpError');
const { makeCandles } = require('../helpers/candles');

// Integration tests need a MySQL server. Configure with TEST_DB_* variables;
// the database named by TEST_DB_NAME is dropped and recreated on each run.
const dbConfig = {
    DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
    DB_PORT: process.env.TEST_DB_PORT || '3306',
    DB_USER: process.env.TEST_DB_USER || 'root',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
    DB_NAME: process.env.TEST_DB_NAME || 'quantumtrade_test',
};

/** Deterministic stand-in for the market data providers. */
function createFakeMarket() {
    const prices = {
        stock: { AAPL: { price: 200, change: 2, changePercent: 1 }, MSFT: { price: 400, change: -4, changePercent: -1 }, SPY: { price: 500, change: 1, changePercent: 0.2 }, SHORT: { price: 10, change: 0, changePercent: 0 }, 'NIFTYBEES.NSE': { price: 250, change: 1, changePercent: 0.4 } },
        crypto: { BTC: { price: 60000, change: 600, changePercent: 1 }, ETH: { price: 3000, change: -90, changePercent: -3 } },
    };
    const quote = (type, symbol) => {
        const p = prices[type][symbol];
        if (!p) throw notFound(`No quote found for ${symbol}`);
        const currency = /\.(NSE|BSE)$/.test(symbol) ? 'INR' : 'USD';
        return { symbol, assetType: type, currency, ...p, asOf: new Date().toISOString(), source: 'test' };
    };
    return {
        prices,
        getQuote: async (type, symbol) => quote(type, symbol),
        async getQuotes(type, symbols) {
            const quotes = new Map();
            const errors = new Map();
            for (const s of symbols) {
                try { quotes.set(s, quote(type, s)); } catch (err) { errors.set(s, err.message); }
            }
            return { quotes, errors };
        },
        async getDailyCandles(type, symbol) {
            quote(type, symbol);
            // Deterministic multi-year history per symbol; SHORT has too little history on purpose.
            const seed = [...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100_000, 7);
            const bars = symbol === 'SHORT' ? 100 : 600;
            const candles = makeCandles(bars, { seed, drift: type === 'crypto' ? 0.0008 : 0.0004, vol: type === 'crypto' ? 0.03 : 0.012, start: Date.UTC(2023, 0, 1) });
            return { symbol, assetType: type, currency: 'USD', approximateOhlc: false, candles, source: 'test' };
        },
        search: async (type, q) => Object.keys(prices[type]).filter((s) => s.includes(q.toUpperCase())).map((symbol) => ({ symbol, assetType: type })),
        topCryptos: async (limit) => Object.entries(prices.crypto).slice(0, limit).map(([symbol, p]) => ({ symbol, ...p })),
        cryptoInfo: async (symbol) => ({ symbol, name: symbol }),
        async fxRate(from, to) {
            const perUsd = { USD: 1, INR: 80, EUR: 0.9 };
            if (!perUsd[from] || !perUsd[to]) throw notFound(`No exchange rate for ${!perUsd[from] ? from : to}`);
            return perUsd[to] / perUsd[from];
        },
        async indices() {
            return [
                { label: 'S&P 500', symbol: 'SPY', quote: quote('stock', 'AAPL'), error: null },
                { label: 'Nifty 50', symbol: 'NIFTYBEES.NSE', quote: null, error: 'not available on your plan' },
            ];
        },
    };
}

async function setup(overrides = {}) {
    try {
        const admin = await mysql.createConnection({
            host: dbConfig.DB_HOST, port: Number(dbConfig.DB_PORT), user: dbConfig.DB_USER, password: dbConfig.DB_PASSWORD,
        });
        await admin.query(`DROP DATABASE IF EXISTS \`${dbConfig.DB_NAME}\``);
        await admin.query(`CREATE DATABASE \`${dbConfig.DB_NAME}\``);
        await admin.end();
    } catch (err) {
        return { skip: `MySQL not available for integration tests (${err.code || err.message})` };
    }

    const env = {
        ...loadEnv({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-that-is-at-least-32-characters', ALERT_CHECK_INTERVAL_SECONDS: '0', ...dbConfig }),
        ...overrides,
    };
    await migrate(env, { info() {} });
    const db = createPool(env);
    const market = createFakeMarket();
    const app = createApp({ env, db, market, logger: createLogger(env) });

    // A supertest agent keeps cookies between requests like a browser does.
    const agent = () => {
        const a = supertest.agent(app);
        a.set('X-Requested-With', 'XMLHttpRequest');
        return a;
    };
    return { env, db, market, app, agent, close: () => db.end() };
}

async function registerUser(agent, name = 'alice') {
    const res = await agent.post('/api/auth/register').send({ username: name, email: `${name}@example.com`, password: 'correct horse battery' });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.user;
}

module.exports = { setup, registerUser };
