'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sma, ema, rsi, macd, bollinger, atr, analyze } = require('../../src/services/indicators');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('sma averages a trailing window', () => {
    assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('ema is seeded with the sma and then smoothed', () => {
    const out = ema([1, 2, 3, 4, 5, 6], 3);
    assert.deepEqual(out.slice(0, 3), [null, null, 2]);
    close(out[3], 3);
    close(out[5], 5);
});

test('ema skips leading nulls', () => {
    const out = ema([null, null, 1, 2, 3], 3);
    assert.deepEqual(out, [null, null, null, null, 2]);
});

test('rsi matches the Wilder reference values published by StockCharts', () => {
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
    const out = rsi(closes, 14).slice(14).map((v) => Number(v.toFixed(2)));
    assert.deepEqual(out, [70.46, 66.25, 66.48, 69.35, 66.29, 57.92]);
});

test('rsi is 100 for a strictly rising series and 50 for a flat one', () => {
    const rising = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.equal(rsi(rising, 14).at(-1), 100);
    assert.equal(rsi(new Array(20).fill(5), 14).at(-1), 50);
});

test('macd line is fast ema minus slow ema and histogram is line minus signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const { macd: line, signal, histogram } = macd(closes);
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    close(line[40], fast[40] - slow[40]);
    close(histogram[50], line[50] - signal[50]);
    assert.equal(line[24], null);
    assert.equal(signal[25 + 7], null);
    assert.notEqual(signal[25 + 8], null);
});

test('bollinger bands collapse onto the middle for a flat series', () => {
    const { upper, middle, lower } = bollinger(new Array(25).fill(10), 20, 2);
    assert.equal(upper[24], 10);
    assert.equal(middle[24], 10);
    assert.equal(lower[24], 10);
    assert.equal(middle[18], null);
});

test('atr uses the true range including gaps from the previous close', () => {
    const candles = Array.from({ length: 16 }, (_, i) => ({ high: 11 + i, low: 9 + i, close: 10 + i }));
    // Each bar: high-low = 2, |high - prevClose| = 2, |low - prevClose| = 0 -> TR = 2.
    const out = atr(candles, 14);
    assert.equal(out[13], null);
    close(out[14], 2);
    close(out[15], 2);
});

test('analyze returns aligned series and a signal summary', () => {
    const candles = Array.from({ length: 80 }, (_, i) => {
        const c = 100 + i;
        return { date: `2024-01-${i}`, open: c - 0.5, high: c + 1, low: c - 1, close: c, volume: 1000 };
    });
    const { series, summary } = analyze(candles);
    assert.equal(series.length, 80);
    assert.ok(series[79].sma50 !== null && series[79].rsi14 !== null);
    assert.ok(['bullish', 'bearish', 'neutral'].includes(summary.overall));
    const bySignal = Object.fromEntries(summary.signals.map((s) => [s.indicator, s.signal]));
    // A steady uptrend: trend-following says bullish, RSI flags it as overbought.
    assert.equal(bySignal['Trend (SMA 20/50)'], 'bullish');
    assert.equal(bySignal['RSI (14)'], 'bearish');
});

test('analyze reports insufficient data for very short series', () => {
    const { summary } = analyze([{ date: 'd', open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
    assert.equal(summary.overall, 'insufficient_data');
});

test('macd signal treats floating point noise as neutral and detects crossovers', () => {
    const linear = Array.from({ length: 80 }, (_, i) => ({ date: String(i), open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 }));
    const flat = analyze(linear).summary.signals.find((s) => s.indicator.startsWith('MACD'));
    assert.equal(flat.signal, 'neutral');

    // Falling then sharply rising: MACD ends above its signal line.
    const vShape = Array.from({ length: 80 }, (_, i) => {
        const c = i < 60 ? 200 - i : 140 + (i - 60) * 5;
        return { date: String(i), open: c, high: c + 1, low: c - 1, close: c, volume: 1 };
    });
    const up = analyze(vShape).summary.signals.find((s) => s.indicator.startsWith('MACD'));
    assert.equal(up.signal, 'bullish');
});
