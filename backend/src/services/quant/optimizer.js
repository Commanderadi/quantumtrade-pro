'use strict';

const { covMatrix, mean, matVec, dot, sum } = require('./stats');
const { badRequest } = require('../../utils/httpError');

const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Euclidean projection onto {w : sum(w) = 1, 0 <= w_i <= cap} (bisection on the shift). */
function projectCappedSimplex(v, cap) {
    let lo = Math.min(...v) - cap;
    let hi = Math.max(...v);
    let tau = 0;
    for (let i = 0; i < 80; i++) {
        tau = (lo + hi) / 2;
        const s = sum(v.map((x) => clip(x - tau, 0, cap)));
        if (s > 1) lo = tau;
        else hi = tau;
    }
    return v.map((x) => clip(x - tau, 0, cap));
}

/** Largest eigenvalue of a symmetric matrix by power iteration (used for the step size). */
function maxEigenvalue(m) {
    let v = m.map(() => 1);
    let lambda = 0;
    for (let i = 0; i < 60; i++) {
        const w = matVec(m, v);
        const norm = Math.sqrt(dot(w, w)) || 1;
        lambda = norm / Math.sqrt(dot(v, v));
        v = w.map((x) => x / norm);
    }
    return lambda;
}

/** Maximises mu'w - (gamma / 2) w'Σw over long-only, capped weights by projected gradient ascent. */
function solveUtility(mu, sigma, gamma, cap) {
    const n = mu.length;
    const step = 1 / (gamma * Math.max(maxEigenvalue(sigma), 1e-12));
    let w = projectCappedSimplex(new Array(n).fill(1 / n), cap);
    for (let iter = 0; iter < 4000; iter++) {
        const grad = mu.map((m, i) => m - gamma * dot(sigma[i], w));
        const next = projectCappedSimplex(w.map((x, i) => x + step * grad[i]), cap);
        const change = Math.max(...next.map((x, i) => Math.abs(x - w[i])));
        w = next;
        if (change < 1e-10) break;
    }
    return w;
}

/** Iterative risk-parity: shrink weights of assets that contribute too much risk. */
function riskParity(sigma, cap) {
    const n = sigma.length;
    let w = new Array(n).fill(1 / n);
    for (let iter = 0; iter < 2000; iter++) {
        const sw = matVec(sigma, w);
        const total = dot(w, sw);
        if (total <= 0) break;
        const rc = w.map((x, i) => (x * sw[i]) / total);
        const next = projectCappedSimplex(w.map((x, i) => x * (1 / n / Math.max(rc[i], 1e-12)) ** 0.5), cap);
        const change = Math.max(...next.map((x, i) => Math.abs(x - w[i])));
        w = next;
        if (change < 1e-12) break;
    }
    return w;
}

const METHODS = {
    equal_weight: 'Equal weight',
    inverse_vol: 'Inverse volatility',
    risk_parity: 'Risk parity (equal risk contribution)',
    min_variance: 'Minimum variance',
    max_sharpe: 'Maximum Sharpe (shrunk estimates)',
};

/**
 * Long-only portfolio weights. Inputs are historical daily returns per asset.
 * Estimates are shrunk because raw sample means and covariances are very noisy:
 *  - covariance: 20% pulled toward its diagonal
 *  - expected returns: 50% pulled toward the cross-sectional average
 */
function optimize({ returns, ppy, method, maxWeight = 0.4, riskFree = 0 }) {
    const n = returns.length;
    if (!METHODS[method]) throw badRequest(`Unknown method "${method}"`);
    if (n < 2) throw badRequest('Add at least two assets to optimise a portfolio.');
    const cap = Math.max(maxWeight, 1 / n + 1e-9);

    const raw = covMatrix(returns).map((row) => row.map((x) => x * ppy));
    const sigma = raw.map((row, i) => row.map((x, j) => (i === j ? x : 0.8 * x)));
    const rawMu = returns.map((r) => mean(r) * ppy);
    const avgMu = mean(rawMu);
    const mu = rawMu.map((m) => 0.5 * m + 0.5 * avgMu);
    const vols = sigma.map((row, i) => Math.sqrt(row[i]));

    let weights;
    if (method === 'equal_weight') weights = projectCappedSimplex(new Array(n).fill(1 / n), cap);
    else if (method === 'inverse_vol') weights = projectCappedSimplex(vols.map((v) => 1 / Math.max(v, 1e-9)).map((x, _i, a) => x / sum(a)), cap);
    else if (method === 'risk_parity') weights = riskParity(sigma, cap);
    else if (method === 'min_variance') weights = solveUtility(new Array(n).fill(0), sigma, 1, cap);
    else {
        // Trace the efficient frontier with different risk-aversion levels and keep the best Sharpe.
        let best = null;
        for (let i = 0; i < 24; i++) {
            const gamma = 0.25 * 1.35 ** i;
            const w = solveUtility(mu, sigma, gamma, cap);
            const vol = Math.sqrt(dot(w, matVec(sigma, w)));
            const sharpe = vol > 0 ? (dot(mu, w) - riskFree) / vol : -Infinity;
            if (!best || sharpe > best.sharpe) best = { w, sharpe };
        }
        weights = best.w;
    }

    const sw = matVec(sigma, weights);
    const variance = dot(weights, sw);
    const vol = Math.sqrt(Math.max(variance, 0));
    const expReturn = dot(mu, weights);
    return {
        method,
        label: METHODS[method],
        weights,
        expectedReturn: expReturn,
        expectedVol: vol,
        expectedSharpe: vol > 0 ? (expReturn - riskFree) / vol : 0,
        riskShares: weights.map((w, i) => (variance > 0 ? (w * sw[i]) / variance : 0)),
    };
}

module.exports = { optimize, projectCappedSimplex, METHODS };
