'use strict';

const { HttpError, notFound } = require('../utils/httpError');
const { TtlCache } = require('../utils/cache');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const TTL = {
    quote: MINUTE, // crypto; stock quotes use env.STOCK_QUOTE_CACHE_SECONDS
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

// Our symbols carry an exchange suffix (RELIANCE.NSE). Twelve Data wants the
// bare ticker plus an `exchange` parameter; most suffixes are used as-is.
const TWELVE_EXCHANGE = { LON: 'LSE', TRT: 'TSX', TRV: 'TSXV', DEX: 'XETR', FRK: 'FSX', HKG: 'HKEX', TYO: 'JPX' };

function splitSymbol(symbol) {
    const dot = symbol.lastIndexOf('.');
    if (dot < 1) return { ticker: symbol, suffix: null };
    const suffix = symbol.slice(dot + 1);
    // Share classes such as BRK.B keep the dot; exchange suffixes are 2+ letters.
    if (suffix.length < 2) return { ticker: symbol, suffix: null };
    return { ticker: symbol.slice(0, dot), suffix };
}

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
            throw new HttpError(503, 'Stock data is not configured (set TWELVE_DATA_API_KEY, FINNHUB_API_KEY or ALPHA_VANTAGE_API_KEY)');
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

    // ------------------------------------------------------- Twelve Data

    async function twelveData(path, params) {
        const qs = new URLSearchParams({ ...params, apikey: env.TWELVE_DATA_API_KEY });
        const data = await getJson('Twelve Data', `https://api.twelvedata.com${path}?${qs}`);
        // Twelve Data reports most errors as HTTP 200 with { status: 'error', code }.
        if (data && data.status === 'error') {
            if (data.code === 429) throw rateLimited('Twelve Data');
            if (data.code === 401) throw new HttpError(503, 'Twelve Data API key was rejected');
            if (data.code === 403) throw new HttpError(502, 'Twelve Data: this symbol is not available on your plan');
            if (data.code === 404 || data.code === 400) throw notFound('Symbol not found');
            throw new HttpError(502, `Twelve Data error: ${data.message || data.code}`);
        }
        return data;
    }

    function twelveParams(symbol) {
        const { ticker, suffix } = splitSymbol(symbol);
        return suffix ? { symbol: ticker, exchange: TWELVE_EXCHANGE[suffix] || suffix } : { symbol: ticker };
    }

    async function twelveQuote(symbol) {
        const q = await twelveData('/quote', twelveParams(symbol));
        const price = num(q.close);
        if (price === null) throw notFound(`No quote found for ${symbol}`);
        return {
            symbol, assetType: 'stock', currency: q.currency || stockCurrency(symbol),
            price, change: num(q.change), changePercent: num(q.percent_change),
            open: num(q.open), high: num(q.high), low: num(q.low), previousClose: num(q.previous_close),
            volume: num(q.volume), exchange: q.exchange ?? null, name: q.name ?? null,
            isMarketOpen: typeof q.is_market_open === 'boolean' ? q.is_market_open : null,
            asOf: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : q.datetime ? new Date(`${q.datetime.slice(0, 10)}T00:00:00Z`).toISOString() : null,
            source: 'Twelve Data',
        };
    }

    async function twelveCandles(symbol) {
        const data = await twelveData('/time_series', { ...twelveParams(symbol), interval: '1day', outputsize: '250' });
        const candles = (data.values || [])
            .map((v) => ({
                date: v.datetime.slice(0, 10),
                open: num(v.open), high: num(v.high), low: num(v.low), close: num(v.close), volume: num(v.volume),
            }))
            .filter((c) => c.close !== null)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (!candles.length) throw notFound(`No price history for ${symbol}`);
        return {
            symbol, assetType: 'stock', currency: data.meta?.currency || stockCurrency(symbol),
            approximateOhlc: false, candles, source: 'Twelve Data',
        };
    }

    // Exchanges whose listings are written without a suffix (US).
    const toAppSymbol = (r) => (r.country === 'United States' || !r.exchange ? r.symbol : `${r.symbol}.${r.exchange}`);

    async function twelveSearch(query) {
        const data = await twelveData('/symbol_search', { symbol: query, outputsize: '15' });
        const seen = new Set();
        return (data.data || [])
            .map((r) => ({
                symbol: toAppSymbol(r), name: r.instrument_name, assetType: 'stock', type: r.instrument_type,
                region: r.country ? `${r.country}${r.exchange ? ` · ${r.exchange}` : ''}` : null,
                currency: r.currency || stockCurrency(toAppSymbol(r)),
            }))
            .filter((r) => (seen.has(r.symbol) ? false : seen.add(r.symbol)));
    }

    // ------------------------------------------------------------ stocks

    // Preference order: Twelve Data (worldwide incl. NSE/BSE) > Finnhub (quotes) > Alpha Vantage.
    const quoteTtl = (env.STOCK_QUOTE_CACHE_SECONDS ?? 120) * 1000;

    async function stockQuote(symbol) {
        return cache.wrap(`stock:quote:${symbol}`, quoteTtl, async () => {
            if (env.TWELVE_DATA_API_KEY) return twelveQuote(symbol);
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
            if (env.TWELVE_DATA_API_KEY) return twelveCandles(symbol);
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
            if (env.TWELVE_DATA_API_KEY) return twelveSearch(query);
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

    // ------------------------------------------------------------- FX rates

    /**
     * Fiat exchange rates from CoinGecko's /exchange_rates (quoted per 1 BTC, so
     * any cross rate is a simple ratio). Good for portfolio display, not for trading.
     */
    async function fxRates() {
        return cache.wrap('fx:rates', 10 * MINUTE, async () => {
            const data = await coingecko('/exchange_rates');
            const rates = {};
            for (const [code, r] of Object.entries(data.rates || {})) {
                if (r.type === 'fiat' && num(r.value)) rates[code.toUpperCase()] = r.value;
            }
            if (!rates.USD) throw new HttpError(502, 'Exchange rates are unavailable');
            return { rates, asOf: new Date().toISOString(), source: 'CoinGecko' };
        });
    }

    /** Multiplier that converts an amount in `from` into `to`. */
    async function fxRate(from, to) {
        if (from === to) return 1;
        const { rates } = await fxRates();
        if (!rates[from] || !rates[to]) throw notFound(`No exchange rate for ${!rates[from] ? from : to}`);
        return rates[to] / rates[from];
    }

    // ---------------------------------------------------------------- indices

    async function indices() {
        const list = env.MARKET_INDICES || [];
        const { quotes, errors } = await facade.getQuotes('stock', list.map((i) => i.symbol));
        return list.map((i) => ({ label: i.label, symbol: i.symbol, quote: quotes.get(i.symbol) ?? null, error: errors.get(i.symbol) ?? null }));
    }

    // ---------------------------------------------------------------- facade

    const facade = {
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
        fxRates,
        fxRate,
        indices: () => indices(),
    };
    return facade;
}

module.exports = { createMarketData, stockCurrency, KNOWN_COIN_IDS };
