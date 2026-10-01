'use strict';

const { HttpError, notFound } = require('../utils/httpError');
const { TtlCache } = require('../utils/cache');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const TTL = {
    quote: MINUTE,
    candles: 6 * HOUR,
    search: 24 * HOUR,
    coinId: 24 * HOUR,
    topCryptos: 2 * MINUTE,
    cryptoInfo: HOUR,
};

// Unambiguous ids for the most common tickers; anything else is resolved via CoinGecko search.
const KNOWN_COIN_IDS = {
    BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', BNB: 'binancecoin', SOL: 'solana',
    USDC: 'usd-coin', XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano', TRX: 'tron',
    AVAX: 'avalanche-2', DOT: 'polkadot', LINK: 'chainlink', MATIC: 'matic-network', POL: 'polygon-ecosystem-token',
    LTC: 'litecoin', BCH: 'bitcoin-cash', UNI: 'uniswap', ATOM: 'cosmos', ETC: 'ethereum-classic',
    XLM: 'stellar', FIL: 'filecoin', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism',
    SHIB: 'shiba-inu', TON: 'the-open-network', SUI: 'sui', PEPE: 'pepe',
};

// Alpha Vantage exchange suffixes -> listing currency.
const SUFFIX_CURRENCY = {
    BSE: 'INR', NSE: 'INR', LON: 'GBP', TRT: 'CAD', TRV: 'CAD', DEX: 'EUR', FRK: 'EUR',
    PAR: 'EUR', AMS: 'EUR', SHH: 'CNY', SHZ: 'CNY', HKG: 'HKD', TYO: 'JPY', SAO: 'BRL',
};

function stockCurrency(symbol) {
    const dot = symbol.lastIndexOf('.');
    return (dot !== -1 && SUFFIX_CURRENCY[symbol.slice(dot + 1)]) || 'USD';
}

const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

const rateLimited = (provider) => {
    const err = new HttpError(503, `${provider} rate limit reached. Please try again shortly.`);
    err.retryAfter = 60;
    return err;
};

function createMarketData({ env, fetchImpl = globalThis.fetch, cache = new TtlCache(), logger }) {
    const timeout = env.MARKET_DATA_TIMEOUT_MS;

    async function getJson(provider, url, headers = {}) {
        let res;
        try {
            res = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) });
        } catch (err) {
            logger?.warn({ provider, err: err.message }, 'Market data request failed');
            throw new HttpError(502, `${provider} is unreachable`);
        }
        if (res.status === 429) throw rateLimited(provider);
        if (res.status === 404) throw notFound('Symbol not found');
        if (!res.ok) {
            logger?.warn({ provider, status: res.status }, 'Market data provider error');
            throw new HttpError(502, `${provider} returned an error (${res.status})`);
        }
        return res.json();
    }

    // ---------------------------------------------------------------- stocks

    function requireAlphaVantage() {
        if (!env.ALPHA_VANTAGE_API_KEY) {
            throw new HttpError(503, 'Stock data is not configured (set ALPHA_VANTAGE_API_KEY)');
        }
    }

    async function alphaVantage(params) {
        requireAlphaVantage();
        const qs = new URLSearchParams({ ...params, apikey: env.ALPHA_VANTAGE_API_KEY });
        const data = await getJson('Alpha Vantage', `https://www.alphavantage.co/query?${qs}`);
        if (data['Error Message']) throw notFound('Symbol not found');
        if (data.Note || data.Information) {
            logger?.warn({ message: data.Note || data.Information }, 'Alpha Vantage limit');
            throw rateLimited('Alpha Vantage');
        }
        return data;
    }

    async function finnhub(path, params) {
        const qs = new URLSearchParams(params);
        return getJson('Finnhub', `https://finnhub.io/api/v1${path}?${qs}`, { 'X-Finnhub-Token': env.FINNHUB_API_KEY });
    }

    async function stockQuote(symbol) {
        return cache.wrap(`stock:quote:${symbol}`, TTL.quote, async () => {
            if (env.FINNHUB_API_KEY) {
                const q = await finnhub('/quote', { symbol });
                // Finnhub answers unknown symbols with all zeros.
                if (!q || !q.c) throw notFound(`No quote found for ${symbol}`);
                return {
                    symbol, assetType: 'stock', currency: stockCurrency(symbol),
                    price: num(q.c), change: num(q.d), changePercent: num(q.dp),
                    open: num(q.o), high: num(q.h), low: num(q.l), previousClose: num(q.pc), volume: null,
                    asOf: q.t ? new Date(q.t * 1000).toISOString() : new Date().toISOString(),
                    source: 'Finnhub',
                };
            }
            const data = await alphaVantage({ function: 'GLOBAL_QUOTE', symbol });
            const q = data['Global Quote'];
            if (!q || !q['05. price']) throw notFound(`No quote found for ${symbol}`);
            return {
                symbol, assetType: 'stock', currency: stockCurrency(symbol),
                price: num(q['05. price']), change: num(q['09. change']),
                changePercent: num(String(q['10. change percent'] || '').replace('%', '')),
                open: num(q['02. open']), high: num(q['03. high']), low: num(q['04. low']),
                previousClose: num(q['08. previous close']), volume: num(q['06. volume']),
                asOf: q['07. latest trading day'] ? new Date(`${q['07. latest trading day']}T00:00:00Z`).toISOString() : null,
                source: 'Alpha Vantage',
            };
        });
    }

    async function stockCandles(symbol) {
        return cache.wrap(`stock:candles:${symbol}`, TTL.candles, async () => {
            const data = await alphaVantage({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' });
            const series = data['Time Series (Daily)'];
            if (!series) throw notFound(`No price history for ${symbol}`);
            const candles = Object.entries(series)
                .map(([date, v]) => ({
                    date,
                    open: num(v['1. open']), high: num(v['2. high']), low: num(v['3. low']),
                    close: num(v['4. close']), volume: num(v['5. volume']),
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
            return { symbol, assetType: 'stock', currency: stockCurrency(symbol), approximateOhlc: false, candles, source: 'Alpha Vantage' };
        });
    }

    async function stockSearch(query) {
        return cache.wrap(`stock:search:${query.toLowerCase()}`, TTL.search, async () => {
            if (env.FINNHUB_API_KEY && !env.ALPHA_VANTAGE_API_KEY) {
                const data = await finnhub('/search', { q: query });
                return (data.result || []).slice(0, 15).map((r) => ({
                    symbol: r.symbol, name: r.description, assetType: 'stock', type: r.type, region: null, currency: stockCurrency(r.symbol),
                }));
            }
            const data = await alphaVantage({ function: 'SYMBOL_SEARCH', keywords: query });
            return (data.bestMatches || []).map((m) => ({
                symbol: m['1. symbol'], name: m['2. name'], assetType: 'stock', type: m['3. type'],
                region: m['4. region'], currency: m['8. currency'],
            }));
        });
    }

    // ---------------------------------------------------------------- crypto

    const COINGECKO = 'https://api.coingecko.com/api/v3';
    const coingecko = (path, params = {}) => {
        const qs = new URLSearchParams(params);
        const headers = env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': env.COINGECKO_API_KEY } : {};
        return getJson('CoinGecko', `${COINGECKO}${path}${qs.size ? `?${qs}` : ''}`, headers);
    };

    async function resolveCoinId(symbol) {
        if (KNOWN_COIN_IDS[symbol]) return KNOWN_COIN_IDS[symbol];
        return cache.wrap(`crypto:id:${symbol}`, TTL.coinId, async () => {
            const data = await coingecko('/search', { query: symbol });
            const matches = (data.coins || [])
                .filter((c) => c.symbol?.toUpperCase() === symbol)
                .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity));
            if (!matches.length) throw notFound(`Unknown cryptocurrency: ${symbol}`);
            return matches[0].id;
        });
    }

    async function cryptoQuotes(symbols) {
        const result = new Map();
        const missing = [];
        for (const symbol of symbols) {
            const cached = cache.get(`crypto:quote:${symbol}`);
            if (cached) result.set(symbol, cached);
            else missing.push(symbol);
        }
        if (missing.length) {
            const ids = new Map();
            await Promise.all(missing.map(async (s) => {
                try { ids.set(s, await resolveCoinId(s)); } catch (err) { if (err.status !== 404) throw err; }
            }));
            if (ids.size) {
                const data = await coingecko('/simple/price', {
                    ids: [...new Set(ids.values())].join(','), vs_currencies: 'usd',
                    include_24hr_change: 'true', include_24hr_vol: 'true', include_market_cap: 'true', include_last_updated_at: 'true',
                });
                for (const [symbol, id] of ids) {
                    const d = data[id];
                    if (!d || d.usd === undefined) continue;
                    const price = num(d.usd);
                    const changePercent = num(d.usd_24h_change);
                    const previousClose = changePercent === null ? null : price / (1 + changePercent / 100);
                    const quote = {
                        symbol, assetType: 'crypto', coinId: id, currency: 'USD', price,
                        change: previousClose === null ? null : price - previousClose, changePercent,
                        open: null, high: null, low: null, previousClose,
                        volume: num(d.usd_24h_vol), marketCap: num(d.usd_market_cap),
                        asOf: d.last_updated_at ? new Date(d.last_updated_at * 1000).toISOString() : new Date().toISOString(),
                        source: 'CoinGecko',
                    };
                    cache.set(`crypto:quote:${symbol}`, quote, TTL.quote);
                    result.set(symbol, quote);
                }
            }
        }
        return result;
    }

    async function cryptoQuote(symbol) {
        const quote = (await cryptoQuotes([symbol])).get(symbol);
        if (!quote) throw notFound(`Unknown cryptocurrency: ${symbol}`);
        return quote;
    }

    async function cryptoCandles(symbol) {
        const id = await resolveCoinId(symbol);
        return cache.wrap(`crypto:candles:${id}`, TTL.candles, async () => {
            const data = await coingecko(`/coins/${encodeURIComponent(id)}/market_chart`, { vs_currency: 'usd', days: '180', interval: 'daily' });
            const volumes = new Map((data.total_volumes || []).map(([t, v]) => [new Date(t).toISOString().slice(0, 10), v]));
            const byDate = new Map();
            for (const [t, price] of data.prices || []) byDate.set(new Date(t).toISOString().slice(0, 10), price);
            // CoinGecko's free daily series only has closes; derive open from the
            // previous close so range-based indicators (ATR) remain meaningful.
            const candles = [];
            let prev = null;
            for (const [date, close] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
                const open = prev ?? close;
                candles.push({ date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: volumes.get(date) ?? null });
                prev = close;
            }
            if (!candles.length) throw notFound(`No price history for ${symbol}`);
            return { symbol, assetType: 'crypto', currency: 'USD', approximateOhlc: true, candles, source: 'CoinGecko' };
        });
    }

    async function cryptoSearch(query) {
        return cache.wrap(`crypto:search:${query.toLowerCase()}`, TTL.search, async () => {
            const data = await coingecko('/search', { query });
            return (data.coins || []).slice(0, 15).map((c) => ({
                symbol: c.symbol.toUpperCase(), name: c.name, assetType: 'crypto', coinId: c.id,
                marketCapRank: c.market_cap_rank ?? null, image: c.thumb ?? null,
            }));
        });
    }

    async function topCryptos(limit) {
        return cache.wrap(`crypto:top:${limit}`, TTL.topCryptos, async () => {
            const data = await coingecko('/coins/markets', {
                vs_currency: 'usd', order: 'market_cap_desc', per_page: String(limit), page: '1', sparkline: 'false',
            });
            return data.map((c) => ({
                symbol: c.symbol.toUpperCase(), name: c.name, coinId: c.id, image: c.image,
                price: num(c.current_price), changePercent: num(c.price_change_percentage_24h),
                marketCap: num(c.market_cap), volume: num(c.total_volume), rank: c.market_cap_rank,
            }));
        });
    }

    async function cryptoInfo(symbol) {
        const id = await resolveCoinId(symbol);
        return cache.wrap(`crypto:info:${id}`, TTL.cryptoInfo, async () => {
            const d = await coingecko(`/coins/${encodeURIComponent(id)}`, {
                localization: 'false', tickers: 'false', community_data: 'false', developer_data: 'false', sparkline: 'false',
            });
            const md = d.market_data || {};
            return {
                symbol, coinId: id, name: d.name, image: d.image?.large ?? null,
                // Description is plain text from CoinGecko but may contain HTML links; strip tags.
                description: (d.description?.en || '').replace(/<[^>]*>/g, '').slice(0, 2000),
                homepage: d.links?.homepage?.find(Boolean) ?? null,
                marketCapRank: d.market_cap_rank ?? null,
                circulatingSupply: num(md.circulating_supply), totalSupply: num(md.total_supply), maxSupply: num(md.max_supply),
                allTimeHigh: num(md.ath?.usd), allTimeHighDate: md.ath_date?.usd ?? null,
                allTimeLow: num(md.atl?.usd), allTimeLowDate: md.atl_date?.usd ?? null,
            };
        });
    }

    // ---------------------------------------------------------------- facade

    return {
        getQuote: (assetType, symbol) => (assetType === 'crypto' ? cryptoQuote(symbol) : stockQuote(symbol)),

        /** Returns a Map(symbol -> quote); symbols that fail are reported in `errors`. */
        async getQuotes(assetType, symbols) {
            const unique = [...new Set(symbols)];
            const errors = new Map();
            if (assetType === 'crypto') {
                const quotes = await cryptoQuotes(unique).catch((err) => {
                    for (const s of unique) errors.set(s, err.message);
                    return new Map();
                });
                for (const s of unique) if (!quotes.has(s) && !errors.has(s)) errors.set(s, 'Quote unavailable');
                return { quotes, errors };
            }
            const quotes = new Map();
            // Sequential to stay friendly with free-tier stock API rate limits.
            for (const s of unique) {
                try { quotes.set(s, await stockQuote(s)); } catch (err) { errors.set(s, err.message); }
            }
            return { quotes, errors };
        },

        getDailyCandles: (assetType, symbol) => (assetType === 'crypto' ? cryptoCandles(symbol) : stockCandles(symbol)),
        search: (assetType, query) => (assetType === 'crypto' ? cryptoSearch(query) : stockSearch(query)),
        topCryptos,
        cryptoInfo,
    };
}

module.exports = { createMarketData, stockCurrency, KNOWN_COIN_IDS };
