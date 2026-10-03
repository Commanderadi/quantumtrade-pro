'use strict';

const { sma, rsi, macd, bollinger } = require('../indicators');
const { std } = require('./stats');
const { badRequest } = require('../../utils/httpError');

// Each strategy turns daily candles into a target weight (0..1) per bar, using only
// information available at that bar's close. The backtester trades it on the next open.

const int = (key, label, min, max, def) => ({ key, label, min, max, default: def, integer: true });
const num = (key, label, min, max, def, step = 0.1) => ({ key, label, min, max, default: def, integer: false, step });

function rollingExtreme(values, window, pick) {
    // Extreme of the PREVIOUS `window` values (the current bar is excluded to avoid look-ahead).
    const out = new Array(values.length).fill(null);
    for (let i = window; i < values.length; i++) {
        let v = values[i - window];
        for (let j = i - window + 1; j < i; j++) v = pick(v, values[j]);
        out[i] = v;
    }
    return out;
}

const grid = (axes, filter = () => true) => {
    let combos = [{}];
    for (const [key, values] of Object.entries(axes)) combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
    return combos.filter(filter);
};

const STRATEGIES = [
    {
        id: 'buy_hold',
        name: 'Buy and hold',
        family: 'baseline',
        description: 'Fully invested the whole time. The benchmark every active strategy has to beat.',
        params: [],
        grid: () => [{}],
        signals: (candles) => candles.map(() => 1),
    },
    {
        id: 'sma_cross',
        name: 'Moving-average crossover',
        family: 'trend',
        description: 'Long while the fast average is above the slow one; flat otherwise. Classic trend following.',
        params: [int('fast', 'Fast period', 2, 200, 20), int('slow', 'Slow period', 5, 400, 50)],
        validate: (p) => (p.fast < p.slow ? null : 'Fast period must be shorter than the slow period'),
        grid: () => grid({ fast: [5, 10, 15, 20, 30, 40], slow: [30, 50, 80, 100, 150, 200] }, (p) => p.fast < p.slow),
        signals(candles, { fast, slow }) {
            const closes = candles.map((c) => c.close);
            const f = sma(closes, fast);
            const s = sma(closes, slow);
            return closes.map((_, i) => (f[i] !== null && s[i] !== null && f[i] > s[i] ? 1 : 0));
        },
    },
    {
        id: 'donchian_breakout',
        name: 'Channel breakout (Donchian)',
        family: 'trend',
        description: 'Buy a new N-day closing high, exit on a new M-day closing low (the "turtle" rules).',
        params: [int('entry', 'Entry lookback', 5, 250, 20), int('exit', 'Exit lookback', 3, 120, 10)],
        validate: (p) => (p.exit <= p.entry ? null : 'Exit lookback must not be longer than the entry lookback'),
        grid: () => grid({ entry: [10, 20, 40, 55, 100], exit: [5, 10, 20, 30] }, (p) => p.exit <= p.entry),
        signals(candles, { entry, exit }) {
            const closes = candles.map((c) => c.close);
            const hi = rollingExtreme(closes, entry, Math.max);
            const lo = rollingExtreme(closes, exit, Math.min);
            let pos = 0;
            return closes.map((c, i) => {
                if (hi[i] === null || lo[i] === null) return 0;
                if (pos === 0 && c > hi[i]) pos = 1;
                else if (pos === 1 && c < lo[i]) pos = 0;
                return pos;
            });
        },
    },
    {
        id: 'momentum',
        name: 'Time-series momentum',
        family: 'trend',
        description: 'Long while the price is higher than it was N days ago. Simple, widely documented momentum effect.',
        params: [int('lookback', 'Lookback (days)', 5, 400, 90)],
        grid: () => grid({ lookback: [20, 40, 60, 90, 120, 180, 250] }),
        signals(candles, { lookback }) {
            const closes = candles.map((c) => c.close);
            return closes.map((c, i) => (i >= lookback && c > closes[i - lookback] ? 1 : 0));
        },
    },
    {
        id: 'macd_trend',
        name: 'MACD trend',
        family: 'trend',
        description: 'Long while the MACD line is above its signal line.',
        params: [int('fast', 'Fast EMA', 2, 100, 12), int('slow', 'Slow EMA', 5, 200, 26), int('signal', 'Signal EMA', 2, 50, 9)],
        validate: (p) => (p.fast < p.slow ? null : 'Fast EMA must be shorter than the slow EMA'),
        grid: () => [{ fast: 12, slow: 26, signal: 9 }, { fast: 8, slow: 17, signal: 9 }, { fast: 5, slow: 35, signal: 5 }, { fast: 19, slow: 39, signal: 9 }],
        signals(candles, { fast, slow, signal }) {
            const m = macd(candles.map((c) => c.close), fast, slow, signal);
            return candles.map((_, i) => (m.macd[i] !== null && m.signal[i] !== null && m.macd[i] > m.signal[i] ? 1 : 0));
        },
    },
    {
        id: 'rsi_reversion',
        name: 'RSI mean reversion',
        family: 'mean-reversion',
        description: 'Buy when RSI drops below the entry level (oversold), sell when it recovers above the exit level.',
        params: [int('period', 'RSI period', 2, 50, 14), num('entry', 'Buy below', 5, 50, 30, 1), num('exit', 'Sell above', 40, 95, 55, 1)],
        validate: (p) => (p.entry < p.exit ? null : 'Buy level must be lower than the sell level'),
        grid: () => grid({ period: [14], entry: [20, 25, 30, 35], exit: [50, 55, 60, 70] }),
        signals(candles, { period, entry, exit }) {
            const r = rsi(candles.map((c) => c.close), period);
            let pos = 0;
            return r.map((v) => {
                if (v === null) return 0;
                if (pos === 0 && v < entry) pos = 1;
                else if (pos === 1 && v > exit) pos = 0;
                return pos;
            });
        },
    },
    {
        id: 'bollinger_reversion',
        name: 'Bollinger mean reversion',
        family: 'mean-reversion',
        description: 'Buy when the close falls below the lower Bollinger band, sell when it returns to the middle band.',
        params: [int('period', 'Band period', 5, 100, 20), num('width', 'Band width (std devs)', 0.5, 4, 2, 0.1)],
        grid: () => grid({ period: [10, 20, 30], width: [1.5, 2, 2.5] }),
        signals(candles, { period, width }) {
            const closes = candles.map((c) => c.close);
            const b = bollinger(closes, period, width);
            let pos = 0;
            return closes.map((c, i) => {
                if (b.lower[i] === null) return 0;
                if (pos === 0 && c < b.lower[i]) pos = 1;
                else if (pos === 1 && c >= b.middle[i]) pos = 0;
                return pos;
            });
        },
    },
    {
        id: 'trend_vol_target',
        name: 'Trend + volatility targeting',
        family: 'risk-managed',
        description: 'Only invested while the price is above its long-term average, and sized down when volatility is high so risk stays near the target. The approach used by many managed-futures funds.',
        params: [int('trend', 'Trend average (days)', 20, 400, 100), num('targetVol', 'Target annual volatility', 0.05, 0.6, 0.15, 0.01), int('volWindow', 'Volatility window (days)', 10, 120, 20)],
        grid: () => grid({ trend: [50, 100, 150, 200], targetVol: [0.1, 0.15, 0.2], volWindow: [20] }),
        signals(candles, { trend, targetVol, volWindow }, ppy = 252) {
            const closes = candles.map((c) => c.close);
            const avg = sma(closes, trend);
            return closes.map((c, i) => {
                if (avg[i] === null || i < volWindow + 1) return 0;
                if (c <= avg[i]) return 0;
                const rets = [];
                for (let j = i - volWindow + 1; j <= i; j++) rets.push(closes[j] / closes[j - 1] - 1);
                const vol = std(rets) * Math.sqrt(ppy);
                return vol > 0 ? Math.min(1, targetVol / vol) : 1;
            });
        },
    },
];

const BY_ID = new Map(STRATEGIES.map((s) => [s.id, s]));

function getStrategy(id) {
    const s = BY_ID.get(id);
    if (!s) throw badRequest(`Unknown strategy "${id}"`);
    return s;
}

/** Applies defaults and validates user-supplied parameters against the strategy definition. */
function resolveParams(strategy, given = {}) {
    const out = {};
    for (const p of strategy.params) {
        const raw = given[p.key] ?? p.default;
        const value = Number(raw);
        if (!Number.isFinite(value)) throw badRequest(`${p.label} must be a number`);
        if (p.integer && !Number.isInteger(value)) throw badRequest(`${p.label} must be a whole number`);
        if (value < p.min || value > p.max) throw badRequest(`${p.label} must be between ${p.min} and ${p.max}`);
        out[p.key] = value;
    }
    for (const key of Object.keys(given)) if (!strategy.params.some((p) => p.key === key)) throw badRequest(`Unknown parameter "${key}" for ${strategy.id}`);
    const problem = strategy.validate?.(out);
    if (problem) throw badRequest(problem);
    return out;
}

/** Longest lookback a parameter set needs before it produces its first signal. */
function warmupBars(params) {
    return Math.max(0, ...Object.entries(params).filter(([k]) => !/^(width|targetVol)$/.test(k)).map(([, v]) => v));
}

const describe = () =>
    STRATEGIES.map(({ id, name, family, description, params }) => ({ id, name, family, description, params }));

module.exports = { STRATEGIES, getStrategy, resolveParams, warmupBars, describe };
