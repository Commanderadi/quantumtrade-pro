'use strict';

const { mean, std } = require('./stats');

/** Trading periods per year for an asset class (stocks trade ~252 days, crypto every day). */
const periodsPerYear = (assetType) => (assetType === 'crypto' ? 365 : 252);

/**
 * Performance statistics of an equity curve sampled once per period.
 * `riskFree` is an annual rate (default 0).
 */
function performance(equity, ppy, riskFree = 0) {
    const n = equity.length;
    const empty = {
        bars: n, totalReturn: 0, cagr: 0, annualVol: 0, sharpe: 0, sortino: 0, maxDrawdown: 0,
        maxDrawdownBars: 0, calmar: null, tStat: 0, years: 0, bestPeriod: 0, worstPeriod: 0,
    };
    if (n < 2) return empty;

    const returns = [];
    for (let i = 1; i < n; i++) returns.push(equity[i - 1] > 0 ? equity[i] / equity[i - 1] - 1 : 0);

    const years = (n - 1) / ppy;
    const totalReturn = equity[n - 1] / equity[0] - 1;
    const cagr = equity[n - 1] > 0 && years > 0 ? (equity[n - 1] / equity[0]) ** (1 / years) - 1 : -1;

    const rfPer = riskFree / ppy;
    const excess = returns.map((r) => r - rfPer);
    const sd = std(returns);
    const sharpe = sd > 0 ? (mean(excess) / sd) * Math.sqrt(ppy) : 0;
    const downside = Math.sqrt(mean(excess.map((r) => Math.min(0, r) ** 2)));
    const sortino = downside > 0 ? (mean(excess) / downside) * Math.sqrt(ppy) : 0;

    let peak = equity[0];
    let maxDrawdown = 0;
    let underwater = 0;
    let maxUnderwater = 0;
    for (const e of equity) {
        if (e >= peak) {
            peak = e;
            underwater = 0;
        } else {
            underwater += 1;
            maxUnderwater = Math.max(maxUnderwater, underwater);
            maxDrawdown = Math.min(maxDrawdown, e / peak - 1);
        }
    }

    return {
        bars: n,
        years,
        totalReturn,
        cagr,
        annualVol: sd * Math.sqrt(ppy),
        sharpe,
        sortino,
        maxDrawdown,
        maxDrawdownBars: maxUnderwater,
        calmar: maxDrawdown < 0 ? cagr / Math.abs(maxDrawdown) : null,
        // Approximate t-statistic of the mean return: |t| < 2 is not distinguishable from luck.
        tStat: sharpe * Math.sqrt(years),
        bestPeriod: Math.max(...returns),
        worstPeriod: Math.min(...returns),
    };
}

/** Drawdown at every point of an equity curve (0 at highs, negative below). */
function drawdownSeries(equity) {
    let peak = -Infinity;
    return equity.map((e) => {
        peak = Math.max(peak, e);
        return peak > 0 ? e / peak - 1 : 0;
    });
}

/** Equity curve from a series of period returns, starting at `start`. */
function equityFromReturns(returns, start = 1) {
    const out = [start];
    for (const r of returns) out.push(out[out.length - 1] * (1 + r));
    return out;
}

module.exports = { periodsPerYear, performance, drawdownSeries, equityFromReturns };
