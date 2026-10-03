'use strict';

// Small, dependency-free statistics helpers. Everything works on plain arrays of numbers.

const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);

/** Sample variance (n - 1). */
function variance(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1);
}
const std = (a) => Math.sqrt(variance(a));

function covariance(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    const ma = mean(a.slice(0, n));
    const mb = mean(b.slice(0, n));
    let s = 0;
    for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / (n - 1);
}

function correlation(a, b) {
    const d = std(a) * std(b);
    return d === 0 ? 0 : covariance(a, b) / d;
}

/** Covariance matrix of equally long series (one array per asset). */
function covMatrix(series) {
    return series.map((a) => series.map((b) => covariance(a, b)));
}

function corrMatrix(series) {
    return series.map((a) => series.map((b) => (a === b ? 1 : correlation(a, b))));
}

/** Linear-interpolated quantile, q in [0, 1]. */
function quantile(values, q) {
    if (!values.length) return null;
    const s = [...values].sort((x, y) => x - y);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Simple returns of a price series. */
function pctReturns(prices) {
    const out = [];
    for (let i = 1; i < prices.length; i++) out.push(prices[i - 1] > 0 ? prices[i] / prices[i - 1] - 1 : 0);
    return out;
}

/** Matrix-vector product. */
const matVec = (m, v) => m.map((row) => sum(row.map((x, j) => x * v[j])));
const dot = (a, b) => sum(a.map((x, i) => x * b[i]));

module.exports = { sum, mean, variance, std, covariance, correlation, covMatrix, corrMatrix, quantile, pctReturns, matVec, dot };
