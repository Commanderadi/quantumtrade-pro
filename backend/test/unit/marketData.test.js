'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketData, stockCurrency } = require('../../src/services/marketData');

const env = { ALPHA_VANTAGE_API_KEY: 'key', FINNHUB_API_KEY: '', COINGECKO_API_KEY: '', MARKET_DATA_TIMEOUT_MS: 1000 };

function fakeFetch(routes) {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        const match = routes.find(([pattern]) => url.includes(pattern));
        if (!match) throw new Error(`Unexpected request: ${url}`);
        const [, body, status = 200] = match;
        return { ok: status < 400, status, json: async () => (typeof body === 'function' ? body(url) : body) };
    };
    return { fetchImpl, calls };
}

test('stockCurrency infers listing currency from exchange suffix', () => {
    assert.equal(stockCurrency('AAPL'), 'USD');
    assert.equal(stockCurrency('RELIANCE.BSE'), 'INR');
    assert.equal(stockCurrency('BRK.B'), 'USD');
});

test('parses Alpha Vantage quotes and caches them', async () => {
    const { fetchImpl, calls } = fakeFetch([[
        'GLOBAL_QUOTE',
        { 'Global Quote': { '05. price': '190.50', '09. change': '1.5', '10. change percent': '0.7937%', '02. open': '189', '03. high': '191', '04. low': '188', '08. previous close': '189', '06. volume': '1000', '07. latest trading day': '2024-05-01' } },
    ]]);
    const market = createMarketData({ env, fetchImpl });
    const q = await market.getQuote('stock', 'AAPL');
    assert.equal(q.price, 190.5);
    assert.equal(q.changePercent, 0.7937);
    assert.equal(q.currency, 'USD');
    await market.getQuote('stock', 'AAPL');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes('symbol=AAPL'));
});

test('maps Alpha Vantage rate-limit notes to 503 instead of fake data', async () => {
    const { fetchImpl } = fakeFetch([['GLOBAL_QUOTE', { Information: 'rate limit reached' }]]);
    const market = createMarketData({ env, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'AAPL'), (err) => err.status === 503 && err.retryAfter === 60);
});

test('unknown stock symbols are 404', async () => {
    const { fetchImpl } = fakeFetch([['GLOBAL_QUOTE', { 'Global Quote': {} }]]);
    const market = createMarketData({ env, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'NOPE'), (err) => err.status === 404);
});

test('stock data without an API key fails clearly', async () => {
    const market = createMarketData({ env: { ...env, ALPHA_VANTAGE_API_KEY: '' }, fetchImpl: async () => assert.fail('no request expected') });
    await assert.rejects(market.getQuote('stock', 'AAPL'), (err) => err.status === 503 && /not configured/.test(err.message));
});

test('uses Finnhub for quotes when configured', async () => {
    const { fetchImpl, calls } = fakeFetch([['finnhub.io/api/v1/quote', { c: 10, d: 1, dp: 11.1, o: 9, h: 10, l: 9, pc: 9, t: 1700000000 }]]);
    const market = createMarketData({ env: { ...env, FINNHUB_API_KEY: 'fh' }, fetchImpl });
    const q = await market.getQuote('stock', 'AAPL');
    assert.equal(q.price, 10);
    assert.equal(q.source, 'Finnhub');
    assert.equal(calls.length, 1);
});

test('crypto quotes resolve symbols to CoinGecko ids and batch requests', async () => {
    const { fetchImpl, calls } = fakeFetch([
        ['/search', { coins: [{ id: 'fake-pepe', symbol: 'xyz', market_cap_rank: 900 }, { id: 'real-xyz', symbol: 'xyz', market_cap_rank: 50 }] }],
        ['/simple/price', (url) => {
            assert.ok(url.includes('bitcoin') && url.includes('real-xyz'));
            return { bitcoin: { usd: 50000, usd_24h_change: 2 }, 'real-xyz': { usd: 1.5, usd_24h_change: -1 } };
        }],
    ]);
    const market = createMarketData({ env, fetchImpl });
    const { quotes, errors } = await market.getQuotes('crypto', ['BTC', 'XYZ']);
    assert.equal(errors.size, 0);
    assert.equal(quotes.get('BTC').price, 50000);
    assert.equal(quotes.get('XYZ').coinId, 'real-xyz');
    assert.equal(calls.filter((c) => c.includes('/simple/price')).length, 1);
});

test('crypto candles are built from daily closes', async () => {
    const day = 86400000;
    const { fetchImpl } = fakeFetch([['/market_chart', { prices: [[0, 10], [day, 12], [2 * day, 11]], total_volumes: [[0, 5], [day, 6], [2 * day, 7]] }]]);
    const market = createMarketData({ env, fetchImpl });
    const { candles, approximateOhlc } = await market.getDailyCandles('crypto', 'BTC');
    assert.equal(approximateOhlc, true);
    assert.deepEqual(candles[1], { date: '1970-01-02', open: 10, high: 12, low: 10, close: 12, volume: 6 });
});

test('provider 429 responses surface as 503', async () => {
    const { fetchImpl } = fakeFetch([['/coins/markets', {}, 429]]);
    const market = createMarketData({ env, fetchImpl });
    await assert.rejects(market.topCryptos(10), (err) => err.status === 503);
});
