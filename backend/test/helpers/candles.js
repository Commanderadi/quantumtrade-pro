'use strict';

/** Deterministic pseudo-random daily candles so tests are reproducible. */
function makeCandles(n, { drift = 0.0004, vol = 0.012, seed = 7, start = Date.UTC(2020, 0, 1) } = {}) {
    let s = seed;
    const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    let price = 100;
    return Array.from({ length: n }, (_, i) => {
        const open = price;
        price *= 1 + drift + vol * (rand() + rand() + rand() + rand() - 2) * 1.7;
        return {
            date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
            open, high: Math.max(open, price) * 1.003, low: Math.min(open, price) * 0.997, close: price, volume: 1000,
        };
    });
}

module.exports = { makeCandles };
