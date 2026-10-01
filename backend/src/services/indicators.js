'use strict';

// Pure technical-analysis functions. Every function returns an array aligned
// with its input; positions without enough history are `null`.

function sma(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

/** EMA seeded with the SMA of the first `period` values. Leading nulls in input are skipped. */
function ema(values, period) {
    const out = new Array(values.length).fill(null);
    const start = values.findIndex((v) => v !== null && v !== undefined);
    if (start === -1 || values.length - start < period) return out;
    const k = 2 / (period + 1);
    let prev = 0;
    for (let i = start; i < start + period; i++) prev += values[i];
    prev /= period;
    out[start + period - 1] = prev;
    for (let i = start + period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/** Relative Strength Index using Wilder's smoothing. */
function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gain += change;
        else loss -= change;
    }
    gain /= period;
    loss /= period;
    const value = () => {
        if (loss === 0) return gain === 0 ? 50 : 100;
        return 100 - 100 / (1 + gain / loss);
    };
    out[period] = value();
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gain = (gain * (period - 1) + Math.max(change, 0)) / period;
        loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
        out[i] = value();
    }
    return out;
}

function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
    const fastEma = ema(closes, fast);
    const slowEma = ema(closes, slow);
    const line = closes.map((_, i) =>
        fastEma[i] === null || slowEma[i] === null ? null : fastEma[i] - slowEma[i]
    );
    const signal = ema(line, signalPeriod);
    const histogram = line.map((v, i) => (v === null || signal[i] === null ? null : v - signal[i]));
    return { macd: line, signal, histogram };
}

function bollinger(closes, period = 20, multiplier = 2) {
    const middle = sma(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
        let variance = 0;
        for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - middle[i]) ** 2;
        const sd = Math.sqrt(variance / period);
        upper[i] = middle[i] + multiplier * sd;
        lower[i] = middle[i] - multiplier * sd;
    }
    return { upper, middle, lower };
}

/** Average True Range using Wilder's smoothing. `candles` need high, low and close. */
function atr(candles, period = 14) {
    const out = new Array(candles.length).fill(null);
    if (candles.length <= period) return out;
    const tr = candles.map((c, i) => {
        if (i === 0) return c.high - c.low;
        const prevClose = candles[i - 1].close;
        return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    });
    let value = 0;
    for (let i = 1; i <= period; i++) value += tr[i];
    value /= period;
    out[period] = value;
    for (let i = period + 1; i < candles.length; i++) {
        value = (value * (period - 1) + tr[i]) / period;
        out[i] = value;
    }
    return out;
}

const last = (arr, offset = 0) => arr[arr.length - 1 - offset] ?? null;

/**
 * Rule-based reading of the latest indicator values. This is descriptive
 * technical analysis, not a prediction or investment advice.
 */
function summarizeSignals({ closes, sma20, sma50, rsi14, macdResult, bands }) {
    const signals = [];
    const close = last(closes);

    if (last(sma20) !== null && last(sma50) !== null) {
        const up = close > last(sma50) && last(sma20) > last(sma50);
        const down = close < last(sma50) && last(sma20) < last(sma50);
        signals.push({
            indicator: 'Trend (SMA 20/50)',
            signal: up ? 'bullish' : down ? 'bearish' : 'neutral',
            detail: up
                ? 'Price and SMA 20 are above SMA 50'
                : down
                    ? 'Price and SMA 20 are below SMA 50'
                    : 'Moving averages are mixed',
        });
    }

    const r = last(rsi14);
    if (r !== null) {
        signals.push({
            indicator: 'RSI (14)',
            signal: r < 30 ? 'bullish' : r > 70 ? 'bearish' : 'neutral',
            detail: r < 30 ? `Oversold at ${r.toFixed(1)}` : r > 70 ? `Overbought at ${r.toFixed(1)}` : `Neutral at ${r.toFixed(1)}`,
        });
    }

    const m = last(macdResult.macd);
    const s = last(macdResult.signal);
    const pm = last(macdResult.macd, 1);
    const ps = last(macdResult.signal, 1);
    if (m !== null && s !== null && pm !== null && ps !== null) {
        // Treat differences below floating point noise as "equal".
        const eps = 1e-9 * Math.max(1, Math.abs(close));
        const diff = Math.abs(m - s) <= eps ? 0 : m - s;
        const prevDiff = Math.abs(pm - ps) <= eps ? 0 : pm - ps;
        const signal = diff > 0 ? 'bullish' : diff < 0 ? 'bearish' : 'neutral';
        let detail = diff > 0 ? 'MACD is above its signal line' : diff < 0 ? 'MACD is below its signal line' : 'MACD is flat against its signal line';
        if (prevDiff <= 0 && diff > 0) detail = 'MACD just crossed above its signal line';
        if (prevDiff >= 0 && diff < 0) detail = 'MACD just crossed below its signal line';
        signals.push({ indicator: 'MACD (12, 26, 9)', signal, detail });
    }

    const upper = last(bands.upper);
    const lower = last(bands.lower);
    if (upper !== null && lower !== null) {
        const above = close > upper;
        const below = close < lower;
        signals.push({
            indicator: 'Bollinger Bands (20, 2)',
            signal: below ? 'bullish' : above ? 'bearish' : 'neutral',
            detail: below ? 'Price closed below the lower band' : above ? 'Price closed above the upper band' : 'Price is inside the bands',
        });
    }

    const score = signals.reduce((acc, s) => acc + (s.signal === 'bullish' ? 1 : s.signal === 'bearish' ? -1 : 0), 0);
    const overall = signals.length === 0 ? 'insufficient_data' : score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
    return { overall, signals };
}

/** Computes all indicators for a series of daily candles. */
function analyze(candles) {
    const closes = candles.map((c) => c.close);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const rsi14 = rsi(closes, 14);
    const macdResult = macd(closes);
    const bands = bollinger(closes, 20, 2);
    const atr14 = atr(candles, 14);
    return {
        series: candles.map((c, i) => ({
            ...c,
            sma20: sma20[i],
            sma50: sma50[i],
            rsi14: rsi14[i],
            macd: macdResult.macd[i],
            macdSignal: macdResult.signal[i],
            macdHistogram: macdResult.histogram[i],
            bbUpper: bands.upper[i],
            bbMiddle: bands.middle[i],
            bbLower: bands.lower[i],
            atr14: atr14[i],
        })),
        summary: summarizeSignals({ closes, sma20, sma50, rsi14, macdResult, bands }),
    };
}

module.exports = { sma, ema, rsi, macd, bollinger, atr, summarizeSignals, analyze };
