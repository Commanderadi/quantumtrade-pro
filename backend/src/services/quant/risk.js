'use strict';

const { mean, std, variance, covariance, covMatrix, corrMatrix, quantile, matVec, dot, sum } = require('./stats');
const { performance, equityFromReturns } = require('./metrics');
const { badRequest } = require('../../utils/httpError');

const MIN_COMMON_DAYS = 60;

/**
 * Aligns several price histories on the dates they all share and returns simple
 * returns between consecutive shared dates.
 * @param histories [{ symbol, candles }]
 */
function alignReturns(histories) {
    if (!histories.length) throw badRequest('No price histories to analyse.');
    const dateSets = histories.map((h) => new Set(h.candles.map((c) => c.date)));
    const common = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))).sort();
    if (common.length < MIN_COMMON_DAYS) {
        throw badRequest(`Only ${common.length} trading days are shared by all assets; at least ${MIN_COMMON_DAYS} are needed. Crypto and stocks trade on different calendars, and short histories limit the analysis.`);
    }
    const returns = histories.map((h) => {
        const close = new Map(h.candles.map((c) => [c.date, c.close]));
        const out = [];
        for (let i = 1; i < common.length; i++) out.push(close.get(common[i]) / close.get(common[i - 1]) - 1);
        return out;
    });
    return { dates: common.slice(1), returns };
}

const portfolioSeries = (weights, returns) => returns[0].map((_, t) => sum(weights.map((w, i) => w * returns[i][t])));

/**
 * Risk report for a constant-weight portfolio (daily rebalanced to the given weights).
 * @param assets [{ symbol, weight }] weights sum to 1
 * @param returns return series per asset, in the same order
 */
function riskReport({ assets, returns, dates, ppy, benchmarkReturns = null }) {
    const weights = assets.map((a) => a.weight);
    const port = portfolioSeries(weights, returns);
    const sigma = covMatrix(returns);
    const sigmaW = matVec(sigma, weights);
    const portVar = dot(weights, sigmaW);
    const portVol = Math.sqrt(Math.max(portVar, 0));

    const contributions = assets.map((a, i) => (portVar > 0 ? (a.weight * sigmaW[i]) / portVar : 0));
    const vols = returns.map((r) => std(r) * Math.sqrt(ppy));
    const weightedVol = sum(weights.map((w, i) => w * vols[i]));
    const equity = equityFromReturns(port);
    const perf = performance(equity, ppy);

    const var95 = -quantile(port, 0.05);
    const var99 = -quantile(port, 0.01);
    const tail = port.filter((r) => r <= -var95);
    // Expected shortfall is never smaller than VaR (guards against floating-point rounding).
    const cvar95 = tail.length ? Math.max(var95, -mean(tail)) : var95;

    const worst = port
        .map((r, i) => ({ date: dates[i], return: r }))
        .sort((a, b) => a.return - b.return)
        .slice(0, 5);

    let beta = null;
    let correlationToBenchmark = null;
    if (benchmarkReturns && variance(benchmarkReturns) > 0) {
        beta = covariance(port, benchmarkReturns) / variance(benchmarkReturns);
        correlationToBenchmark = covariance(port, benchmarkReturns) / (std(port) * std(benchmarkReturns));
    }

    return {
        period: { from: dates[0], to: dates[dates.length - 1], days: dates.length },
        annualReturn: perf.cagr,
        annualVol: portVol * Math.sqrt(ppy),
        sharpe: perf.sharpe,
        maxDrawdown: perf.maxDrawdown,
        var95,
        var99,
        cvar95,
        worstDays: worst,
        beta,
        correlationToBenchmark,
        diversificationRatio: portVol > 0 ? weightedVol / (portVol * Math.sqrt(ppy)) : 1,
        // 1 / sum of squared risk shares: how many equally risky, independent positions this is equivalent to.
        effectiveBets: contributions.some((c) => c > 0) ? 1 / sum(contributions.map((c) => c ** 2)) : assets.length,
        assets: assets.map((a, i) => ({
            symbol: a.symbol,
            weight: a.weight,
            annualVol: vols[i],
            riskShare: contributions[i],
        })),
        correlation: { symbols: assets.map((a) => a.symbol), matrix: corrMatrix(returns) },
    };
}

module.exports = { alignReturns, riskReport, portfolioSeries, MIN_COMMON_DAYS };
