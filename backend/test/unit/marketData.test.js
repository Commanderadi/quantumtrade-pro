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

// ------------------------------------------------------------ Twelve Data

const tdEnv = { ...env, TWELVE_DATA_API_KEY: 'td', ALPHA_VANTAGE_API_KEY: '', FINNHUB_API_KEY: 'fh' };

test('Twelve Data is preferred and maps Indian symbols to ticker + exchange', async () => {
    const { fetchImpl, calls } = fakeFetch([[
        'api.twelvedata.com/quote',
        { symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', currency: 'INR', close: '2950.5', change: '-12.5', percent_change: '-0.42', open: '2960', high: '2970', low: '2940', previous_close: '2963', volume: '1000', is_market_open: false, timestamp: 1700000000 },
    ]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    const q = await market.getQuote('stock', 'RELIANCE.NSE');
    assert.equal(q.symbol, 'RELIANCE.NSE');
    assert.equal(q.currency, 'INR');
    assert.equal(q.price, 2950.5);
    assert.equal(q.changePercent, -0.42);
    assert.equal(q.isMarketOpen, false);
    assert.equal(q.source, 'Twelve Data');
    const url = new URL(calls[0]);
    assert.equal(url.searchParams.get('symbol'), 'RELIANCE');
    assert.equal(url.searchParams.get('exchange'), 'NSE');
    assert.equal(url.searchParams.get('apikey'), 'td');
    assert.equal(calls.length, 1, 'Finnhub must not be called when Twelve Data is configured');
});

test('Twelve Data leaves US symbols and share classes alone', async () => {
    const { fetchImpl, calls } = fakeFetch([['/quote', { close: '10', currency: 'USD' }]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    await market.getQuote('stock', 'AAPL');
    await market.getQuote('stock', 'BRK.B');
    const [a, b] = calls.map((c) => new URL(c).searchParams);
    assert.equal(a.get('symbol'), 'AAPL');
    assert.equal(a.get('exchange'), null);
    assert.equal(b.get('symbol'), 'BRK.B');
    assert.equal(b.get('exchange'), null);
});

test('Twelve Data exchange aliases (London -> LSE)', async () => {
    const { fetchImpl, calls } = fakeFetch([['/quote', { close: '10', currency: 'GBP' }]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    await market.getQuote('stock', 'VOD.LON');
    assert.equal(new URL(calls[0]).searchParams.get('exchange'), 'LSE');
});

test('Twelve Data in-body errors map to proper HTTP errors', async () => {
    const cases = [[429, 503], [404, 404], [400, 404], [401, 503], [403, 402], [500, 502]];
    for (const [code, expected] of cases) {
        const { fetchImpl } = fakeFetch([['/quote', { status: 'error', code, message: 'nope' }]]);
        const market = createMarketData({ env: tdEnv, fetchImpl });
        await assert.rejects(market.getQuote('stock', 'X'), (err) => err.status === expected, `code ${code}`);
    }
});

test('Twelve Data daily candles are sorted oldest first and use the reported currency', async () => {
    const { fetchImpl, calls } = fakeFetch([[
        '/time_series',
        { meta: { currency: 'INR' }, values: [
            { datetime: '2024-01-03', open: '3', high: '4', low: '2', close: '3.5', volume: '30' },
            { datetime: '2024-01-02', open: '2', high: '3', low: '1', close: '2.5', volume: '20' },
        ] },
    ]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    const h = await market.getDailyCandles('stock', 'TCS.NSE');
    assert.deepEqual(h.candles.map((c) => c.date), ['2024-01-02', '2024-01-03']);
    assert.equal(h.currency, 'INR');
    assert.equal(new URL(calls[0]).searchParams.get('interval'), '1day');
});

test('Twelve Data search returns app-style symbols (suffix for non-US listings)', async () => {
    const { fetchImpl } = fakeFetch([[
        '/symbol_search',
        { data: [
            { symbol: 'RELIANCE', instrument_name: 'Reliance Industries', exchange: 'NSE', country: 'India', currency: 'INR', instrument_type: 'Common Stock' },
            { symbol: 'RELIANCE', instrument_name: 'Reliance Industries', exchange: 'BSE', country: 'India', currency: 'INR', instrument_type: 'Common Stock' },
            { symbol: 'AAPL', instrument_name: 'Apple', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_type: 'Common Stock' },
            { symbol: 'AAPL', instrument_name: 'Apple', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_type: 'Common Stock' },
        ] },
    ]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    const results = await market.search('stock', 'rel');
    assert.deepEqual(results.map((r) => r.symbol), ['RELIANCE.NSE', 'RELIANCE.BSE', 'AAPL']);
    assert.equal(results[0].currency, 'INR');
    assert.match(results[0].region, /India · NSE/);
});

test('stock quote cache honours STOCK_QUOTE_CACHE_SECONDS', async () => {
    let now = 0;
    const { TtlCache } = require('../../src/utils/cache');
    const { fetchImpl, calls } = fakeFetch([['/quote', { close: '10', currency: 'USD' }]]);
    const market = createMarketData({ env: { ...tdEnv, STOCK_QUOTE_CACHE_SECONDS: 120 }, fetchImpl, cache: new TtlCache({ now: () => now }) });
    await market.getQuote('stock', 'AAPL');
    now = 119_000;
    await market.getQuote('stock', 'AAPL');
    assert.equal(calls.length, 1);
    now = 121_000;
    await market.getQuote('stock', 'AAPL');
    assert.equal(calls.length, 2);
});

// ------------------------------------------------------------ FX + indices

const fxBody = { rates: { btc: { type: 'crypto', value: 1 }, usd: { type: 'fiat', value: 60000 }, inr: { type: 'fiat', value: 5_040_000 }, eur: { type: 'fiat', value: 55000 }, eth: { type: 'crypto', value: 20 } } };

test('fx rates are cross rates of CoinGecko fiat values and ignore crypto', async () => {
    const { fetchImpl, calls } = fakeFetch([['/exchange_rates', fxBody]]);
    const market = createMarketData({ env, fetchImpl });
    assert.equal(await market.fxRate('USD', 'INR'), 84);
    assert.ok(Math.abs((await market.fxRate('INR', 'USD')) - 1 / 84) < 1e-12);
    assert.equal(await market.fxRate('USD', 'USD'), 1);
    await assert.rejects(market.fxRate('USD', 'ETH'), (err) => err.status === 404);
    await assert.rejects(market.fxRate('USD', 'XYZ'), (err) => err.status === 404);
    assert.equal(calls.length, 1, 'rates are cached');
});

test('indices report per-item errors without failing the whole list', async () => {
    const { fetchImpl } = fakeFetch([
        ['symbol=SPY', { close: '500', percent_change: '0.5', currency: 'USD' }],
        ['symbol=NIFTYBEES', { status: 'error', code: 403, message: 'plan' }],
    ]);
    const market = createMarketData({
        env: { ...tdEnv, MARKET_INDICES: [{ label: 'S&P 500', symbol: 'SPY' }, { label: 'Nifty 50', symbol: 'NIFTYBEES.NSE' }] },
        fetchImpl,
    });
    const [spy, nifty] = await market.indices();
    assert.equal(spy.quote.price, 500);
    assert.equal(spy.error, null);
    assert.equal(nifty.quote, null);
    assert.match(nifty.error, /paid Twelve Data plan/);
});

// ------------------------------------------------- plan limits + fallback

const planBody = { code: 404, message: 'This symbol is available starting with the Grow or Venture plan. Consider upgrading now at https://twelvedata.com/pricing', status: 'error' };

test('Twelve Data errors returned with an HTTP 404 status are read, not treated as "not found"', async () => {
    const { fetchImpl } = fakeFetch([['api.twelvedata.com/quote', planBody, 404]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'TCS.NSE'), (err) => {
        assert.equal(err.status, 402);
        assert.equal(err.planLimited, true);
        assert.match(err.message, /paid Twelve Data plan/);
        return true;
    });
});

test('a genuinely unknown symbol is still a 404 even with an HTTP 404 body', async () => {
    const { fetchImpl } = fakeFetch([['api.twelvedata.com/quote', { code: 404, message: '**symbol** not found: NOPE.', status: 'error' }, 404]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'NOPE'), (err) => err.status === 404 && !err.planLimited);
});

test('plan-limited symbols fall back to Alpha Vantage when it is configured', async () => {
    const { fetchImpl, calls } = fakeFetch([
        ['api.twelvedata.com/quote', planBody, 404],
        ['alphavantage.co', { 'Global Quote': { '05. price': '2950.00', '09. change': '10', '10. change percent': '0.34%', '07. latest trading day': '2024-05-01' } }],
    ]);
    const market = createMarketData({ env: { ...tdEnv, ALPHA_VANTAGE_API_KEY: 'av' }, fetchImpl });
    const q = await market.getQuote('stock', 'RELIANCE.BSE');
    assert.equal(q.price, 2950);
    assert.equal(q.currency, 'INR');
    assert.equal(q.source, 'Alpha Vantage');
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes('symbol=RELIANCE.BSE'));
});

test('plan-limited symbols fall back for price history too', async () => {
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/time_series', planBody, 404],
        ['alphavantage.co', { 'Time Series (Daily)': { '2024-05-01': { '1. open': '1', '2. high': '2', '3. low': '1', '4. close': '1.5', '5. volume': '10' } } }],
    ]);
    const market = createMarketData({ env: { ...tdEnv, ALPHA_VANTAGE_API_KEY: 'av' }, fetchImpl });
    const h = await market.getDailyCandles('stock', 'RELIANCE.BSE');
    assert.equal(h.source, 'Alpha Vantage');
    assert.equal(h.candles.length, 1);
});

test('without a fallback the plan message is reported', async () => {
    const { fetchImpl } = fakeFetch([['api.twelvedata.com/quote', planBody, 404]]);
    const market = createMarketData({ env: tdEnv, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'TCS.NSE'), (err) => err.status === 402);
});

test('if the fallback cannot find the symbol either, the plan message wins', async () => {
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/quote', planBody, 404],
        ['alphavantage.co', { 'Global Quote': {} }],
    ]);
    const market = createMarketData({ env: { ...tdEnv, ALPHA_VANTAGE_API_KEY: 'av' }, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'TCS.NSE'), (err) => err.status === 402);
});

test('fallback does not mask rate limits from Alpha Vantage', async () => {
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/quote', planBody, 404],
        ['alphavantage.co', { Information: 'rate limit' }],
    ]);
    const market = createMarketData({ env: { ...tdEnv, ALPHA_VANTAGE_API_KEY: 'av' }, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'RELIANCE.BSE'), (err) => err.status === 503);
});

// ---------------------------------------------- alternative (BSE) listings

const avEnv = { ...tdEnv, ALPHA_VANTAGE_API_KEY: 'av' };
const avQuote = (price) => ({ 'Global Quote': { '05. price': String(price), '09. change': '1', '10. change percent': '0.1%', '07. latest trading day': '2024-05-01' } });

test('an NSE symbol that the plan does not cover is served from its BSE listing, with a note', async () => {
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/quote', planBody, 404],
        ['alphavantage.co', (url) => (url.includes('symbol=TCS.BSE') ? avQuote(3900) : { 'Global Quote': {} })],
    ]);
    const market = createMarketData({ env: avEnv, fetchImpl });
    const q = await market.getQuote('stock', 'TCS.NSE');
    assert.equal(q.symbol, 'TCS.BSE');
    assert.equal(q.resolvedFrom, 'TCS.NSE');
    assert.equal(q.price, 3900);
    assert.equal(q.currency, 'INR');
    assert.match(q.note, /Showing TCS\.BSE \(BSE listing\) because TCS\.NSE/);
});

test('a bare name is resolved to its BSE listing through search', async () => {
    const { fetchImpl, calls } = fakeFetch([
        ['api.twelvedata.com/quote', planBody, 404],
        ['api.twelvedata.com/symbol_search', { data: [
            { symbol: 'RELIANCE', instrument_name: 'Reliance Industries', exchange: 'NSE', country: 'India', currency: 'INR' },
            { symbol: 'RELIANCE', instrument_name: 'Reliance Industries', exchange: 'BSE', country: 'India', currency: 'INR' },
            { symbol: 'RELIANCEPP', instrument_name: 'Other', exchange: 'BSE', country: 'India', currency: 'INR' },
        ] }],
        ['alphavantage.co', (url) => (url.includes('symbol=RELIANCE.BSE') ? avQuote(1187.5) : { 'Global Quote': {} })],
    ]);
    const market = createMarketData({ env: avEnv, fetchImpl });
    const q = await market.getQuote('stock', 'RELIANCE');
    assert.equal(q.symbol, 'RELIANCE.BSE');
    assert.equal(q.resolvedFrom, 'RELIANCE');
    assert.equal(q.price, 1187.5);
    assert.ok(!calls.some((c) => c.includes('RELIANCEPP')), 'only exact ticker matches are used');
});

test('price history also falls back to the BSE listing', async () => {
    const series = { 'Time Series (Daily)': { '2024-05-01': { '1. open': '1', '2. high': '2', '3. low': '1', '4. close': '1.5', '5. volume': '10' } } };
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/time_series', planBody, 404],
        ['alphavantage.co', (url) => (url.includes('symbol=TCS.BSE') ? series : {})],
    ]);
    const market = createMarketData({ env: avEnv, fetchImpl });
    const h = await market.getDailyCandles('stock', 'TCS.NSE');
    assert.equal(h.symbol, 'TCS.BSE');
    assert.equal(h.resolvedFrom, 'TCS.NSE');
    assert.equal(h.candles.length, 1);
});

test('a typo with no alternative still reports the original error', async () => {
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/quote', { code: 404, message: '**symbol** not found: NOPE.', status: 'error' }, 404],
        ['api.twelvedata.com/symbol_search', { data: [{ symbol: 'NOPE', instrument_name: 'X', exchange: 'NASDAQ', country: 'United States' }] }],
    ]);
    const market = createMarketData({ env: avEnv, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'NOPE'), (err) => err.status === 404);
});

test('an NSE symbol with no BSE alternative reports the plan message', async () => {
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/quote', planBody, 404],
        ['alphavantage.co', { 'Global Quote': {} }],
    ]);
    const market = createMarketData({ env: avEnv, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'ZZZ.NSE'), (err) => err.status === 402);
});

test('rate limits while trying the alternative are surfaced', async () => {
    const { fetchImpl } = fakeFetch([
        ['api.twelvedata.com/quote', planBody, 404],
        ['alphavantage.co', (url) => (url.includes('TCS.BSE') ? { Information: 'rate limit' } : { 'Global Quote': {} })],
    ]);
    const market = createMarketData({ env: avEnv, fetchImpl });
    await assert.rejects(market.getQuote('stock', 'TCS.NSE'), (err) => err.status === 503);
});

test('US symbols never trigger alternative lookups', async () => {
    const { fetchImpl, calls } = fakeFetch([['api.twelvedata.com/quote', { close: '10', currency: 'USD' }]]);
    const market = createMarketData({ env: avEnv, fetchImpl });
    const q = await market.getQuote('stock', 'AAPL');
    assert.equal(q.resolvedFrom, undefined);
    assert.equal(calls.length, 1);
});
