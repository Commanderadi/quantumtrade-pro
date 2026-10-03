'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCandles } = require('../helpers/candles');
const { getStrategy, resolveParams } = require('../../src/services/quant/strategies');
const { evaluateStrategy, optimizeStrategy, walkForward, verdict } = require('../../src/services/quant/research');
const { optimize, projectCappedSimplex } = require('../../src/services/quant/optimizer');
const { alignReturns, riskReport } = require('../../src/services/quant/risk');
const { scanAsset, rankAssets, percentileRanks } = require('../../src/services/quant/scanner');
const { quantile } = require('../../src/services/quant/stats');

const costs = { initialCash: 10_000, commissionBps: 5, slippageBps: 5, rebalanceBand: 0.1 };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// --------------------------------------------------------------- research

test('evaluateStrategy refuses too little history with a helpful message', () => {
    const strategy = getStrategy('sma_cross');
    assert.throws(
        () => evaluateStrategy({ candles: makeCandles(100), strategy, params: resolveParams(strategy, {}), ppy: 252, costs }),
        (e) => e.status === 400 && /at least 150/.test(e.message)
    );
});

test('evaluateStrategy reports in-sample, out-of-sample and buy-and-hold on the same split', () => {
    const candles = makeCandles(500, { seed: 11 });
    const strategy = getStrategy('sma_cross');
    const r = evaluateStrategy({ candles, strategy, params: resolveParams(strategy, {}), ppy: 252, costs, split: 0.7 });
    assert.equal(r.period.bars, 500);
    assert.equal(r.period.splitDate, candles[350].date);
    assert.equal(r.inSample.metrics.bars, 350);
    assert.equal(r.outOfSample.metrics.bars, 500 - 350 + 1); // starts one bar early so the first OOS bar is tradable
    assert.equal(r.outOfSample.buyHold.bars, r.outOfSample.metrics.bars);
    assert.ok(['no_edge', 'inconclusive', 'promising'].includes(r.verdict.rating));
    assert.ok(r.series.length > 100 && r.series[0].strategy === 1);
    assert.ok(Array.isArray(r.trades));
});

test('buy_hold is labelled as the baseline and matches the benchmark exactly', () => {
    const candles = makeCandles(300, { seed: 2 });
    const strategy = getStrategy('buy_hold');
    const r = evaluateStrategy({ candles, strategy, params: {}, ppy: 252, costs });
    assert.equal(r.verdict.rating, 'baseline');
    assert.equal(r.full.metrics.totalReturn, r.buyHold.totalReturn);
});

test('OPTIMISATION NEVER SEES THE OUT-OF-SAMPLE DATA: changing the tail leaves the chosen parameters unchanged', () => {
    const a = makeCandles(500, { seed: 21 });
    const k = Math.floor(500 * 0.7);
    const tail = makeCandles(500 - k, { seed: 777, drift: -0.003, vol: 0.04, start: Date.UTC(2021, 6, 1) });
    // Rebase the alternative tail so it continues from the same last in-sample price.
    const scale = a[k - 1].close / tail[0].open;
    const b = [...a.slice(0, k), ...tail.map((c) => ({ ...c, open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale }))];
    for (const id of ['sma_cross', 'donchian_breakout', 'momentum', 'rsi_reversion', 'trend_vol_target']) {
        const strategy = getStrategy(id);
        const ra = optimizeStrategy({ candles: a, strategy, ppy: 252, costs });
        const rb = optimizeStrategy({ candles: b, strategy, ppy: 252, costs });
        assert.deepEqual(ra.optimization.best, rb.optimization.best, `${id} chose parameters using out-of-sample data`);
        assert.deepEqual(ra.inSample.metrics, rb.inSample.metrics, id);
    }
});

test('optimizeStrategy reports the number of trials and the Sharpe expected from luck', () => {
    const candles = makeCandles(500, { seed: 31 });
    const strategy = getStrategy('sma_cross');
    const r = optimizeStrategy({ candles, strategy, ppy: 252, costs });
    assert.equal(r.optimization.trials, strategy.grid().length);
    assert.ok(r.optimization.luckSharpe > 0);
    assert.ok(r.optimization.ranking.length <= 10);
    assert.ok(r.optimization.ranking[0].sharpe >= r.optimization.ranking.at(-1).sharpe);
    assert.deepEqual(r.params, r.optimization.best.params);
});

test('on pure random walks, optimised strategies rarely look "promising" (guards against fake edges)', () => {
    let promising = 0;
    const runs = 24;
    for (let seed = 1; seed <= runs; seed++) {
        const candles = makeCandles(600, { seed: seed * 101, drift: 0 });
        const r = optimizeStrategy({ candles, strategy: getStrategy('sma_cross'), ppy: 252, costs });
        if (r.verdict.rating === 'promising') promising += 1;
    }
    assert.ok(promising <= 3, `${promising}/${runs} random series were rated promising`);
});

test('walkForward tiles the out-of-sample windows without gaps or overlap', () => {
    const candles = makeCandles(600, { seed: 41 });
    const r = walkForward({ candles, strategy: getStrategy('sma_cross'), ppy: 252, costs, trainBars: 300, testBars: 100 });
    assert.equal(r.windows.folds, 3);
    for (let i = 1; i < r.folds.length; i++) {
        const prev = candles.findIndex((c) => c.date === r.folds[i - 1].testTo);
        const next = candles.findIndex((c) => c.date === r.folds[i].testFrom);
        assert.equal(next, prev + 1, 'test windows must be contiguous');
        assert.ok(r.folds[i].trainFrom > r.folds[i - 1].trainFrom);
    }
    assert.equal(r.series.length, 3 * 100 + 1);
    assert.equal(r.outOfSample.metrics.bars, 301);
    assert.ok(r.parameterStability > 0 && r.parameterStability <= 1);
});

test('walkForward validates its windows', () => {
    const candles = makeCandles(300, { seed: 1 });
    assert.throws(() => walkForward({ candles, strategy: getStrategy('sma_cross'), ppy: 252, costs, trainBars: 280, testBars: 100 }), (e) => e.status === 400);
});

test('verdict is conservative: no edge, inconclusive and promising cases', () => {
    const m = (o) => ({ bars: 200, sharpe: 0, tStat: 0, ...o });
    assert.equal(verdict({ oos: m({ bars: 30 }), bench: m({}), totalTrades: 50, inSampleSharpe: 1 }).rating, 'inconclusive');
    assert.equal(verdict({ oos: m({ sharpe: 0.4, tStat: 1 }), bench: m({ sharpe: 0.9 }), totalTrades: 40, inSampleSharpe: 0.5 }).rating, 'no_edge');
    assert.equal(verdict({ oos: m({ sharpe: -0.2, tStat: -0.5 }), bench: m({ sharpe: -0.5 }), totalTrades: 40, inSampleSharpe: 0.5 }).rating, 'no_edge');
    assert.equal(verdict({ oos: m({ sharpe: 1.4, tStat: 1.2 }), bench: m({ sharpe: 0.9 }), totalTrades: 40, inSampleSharpe: 1.5 }).rating, 'inconclusive');
    assert.equal(verdict({ oos: m({ sharpe: 1.4, tStat: 2.6 }), bench: m({ sharpe: 0.9 }), totalTrades: 40, inSampleSharpe: 1.5 }).rating, 'promising');
    const overfit = verdict({ oos: m({ sharpe: 1.0, tStat: 2.6 }), bench: m({ sharpe: 0.5 }), totalTrades: 40, inSampleSharpe: 3 });
    assert.equal(overfit.rating, 'inconclusive');
    assert.match(overfit.reasons.join(' '), /overfitting/);
});

// -------------------------------------------------------------- optimizer

// Two uncorrelated assets (exactly orthogonal series) with daily vols 1% and 2%.
const a = Array.from({ length: 400 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
const b = Array.from({ length: 400 }, (_, i) => (Math.floor(i / 2) % 2 === 0 ? 0.02 : -0.02));
const c = Array.from({ length: 400 }, (_, i) => (Math.floor(i / 4) % 2 === 0 ? 0.015 : -0.015));

test('projectCappedSimplex returns feasible weights', () => {
    for (const v of [[3, 1, -2], [0.2, 0.2, 0.2], [10, 10, 10, 10], [-5, -1, -9]]) {
        const w = projectCappedSimplex(v, 0.6);
        close(w.reduce((s, x) => s + x, 0), 1, 1e-9);
        assert.ok(w.every((x) => x >= -1e-12 && x <= 0.6 + 1e-9));
    }
});

test('min_variance matches the closed-form solution for uncorrelated assets', () => {
    const r = optimize({ returns: [a, b], ppy: 252, method: 'min_variance', maxWeight: 1 });
    close(r.weights[0], 0.8, 2e-3); // w1 = s2^2 / (s1^2 + s2^2)
    close(r.weights[1], 0.2, 2e-3);
    const capped = optimize({ returns: [a, b], ppy: 252, method: 'min_variance', maxWeight: 0.7 });
    close(capped.weights[0], 0.7, 1e-6);
    close(capped.weights[1], 0.3, 1e-6);
});

test('risk_parity equalises risk contributions and inverse_vol uses 1/vol', () => {
    const rp = optimize({ returns: [a, b, c], ppy: 252, method: 'risk_parity', maxWeight: 1 });
    for (const share of rp.riskShares) close(share, 1 / 3, 5e-3);
    const iv = optimize({ returns: [a, b], ppy: 252, method: 'inverse_vol', maxWeight: 1 });
    close(iv.weights[0], 2 / 3, 1e-6);
});

test('every method returns long-only weights that respect the cap and sum to one', () => {
    const rising = Array.from({ length: 400 }, (_, i) => 0.002 + (i % 3 === 0 ? 0.01 : -0.005));
    for (const method of ['equal_weight', 'inverse_vol', 'risk_parity', 'min_variance', 'max_sharpe']) {
        const r = optimize({ returns: [a, b, c, rising], ppy: 252, method, maxWeight: 0.4 });
        close(r.weights.reduce((s, x) => s + x, 0), 1, 1e-6);
        assert.ok(r.weights.every((w) => w >= -1e-9 && w <= 0.4 + 1e-6), `${method}: ${r.weights}`);
        close(r.riskShares.reduce((s, x) => s + x, 0), 1, 1e-6);
    }
});

test('max_sharpe tilts toward the asset with the better risk-adjusted return', () => {
    const good = Array.from({ length: 400 }, (_, i) => 0.0012 + (i % 2 === 0 ? 0.004 : -0.004));
    const bad = Array.from({ length: 400 }, (_, i) => -0.0004 + (i % 2 === 0 ? 0.004 : -0.004));
    const mid = Array.from({ length: 400 }, (_, i) => 0.0004 + (Math.floor(i / 2) % 2 === 0 ? 0.004 : -0.004));
    const r = optimize({ returns: [good, bad, mid], ppy: 252, method: 'max_sharpe', maxWeight: 1 });
    assert.ok(r.weights[0] > r.weights[1]);
    const ew = optimize({ returns: [good, bad, mid], ppy: 252, method: 'equal_weight', maxWeight: 1 });
    assert.ok(r.expectedSharpe >= ew.expectedSharpe - 1e-9);
});

test('optimize rejects bad input', () => {
    assert.throws(() => optimize({ returns: [a], ppy: 252, method: 'min_variance' }), (e) => e.status === 400);
    assert.throws(() => optimize({ returns: [a, b], ppy: 252, method: 'magic' }), (e) => e.status === 400);
});

// ------------------------------------------------------------------- risk

const dated = (symbol, closes, startDay = 0) => ({
    symbol,
    candles: closes.map((close, i) => ({ date: new Date(Date.UTC(2022, 0, 1 + startDay + i)).toISOString().slice(0, 10), close })),
});
const closesFromReturns = (rets) => rets.reduce((acc, r) => [...acc, acc.at(-1) * (1 + r)], [100]);

test('alignReturns uses only dates shared by every asset', () => {
    const x = dated('X', closesFromReturns(a.slice(0, 99)));
    const y = dated('Y', closesFromReturns(b.slice(0, 99)), 20); // starts 20 days later
    const { dates, returns } = alignReturns([x, y]);
    // X covers days 0-99, Y covers days 20-119: 80 shared dates give 79 returns.
    assert.equal(dates.length, 79);
    assert.equal(returns[0].length, returns[1].length);
    assert.throws(() => alignReturns([dated('X', closesFromReturns(a.slice(0, 30))), dated('Y', closesFromReturns(b.slice(0, 30)))]), (e) => e.status === 400 && /shared/.test(e.message));
});

test('riskReport: risk shares, volatility and tail measures on a known portfolio', () => {
    const dates = a.map((_, i) => `d${i}`);
    const r = riskReport({ assets: [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }], returns: [a, b], dates, ppy: 252 });
    // Orthogonal series: portfolio variance = 0.25 * (sA^2 + sB^2); asset B carries 80% of the risk.
    close(r.assets[1].riskShare, 0.8, 5e-3);
    close(r.assets[0].riskShare + r.assets[1].riskShare, 1, 1e-9);
    close(r.effectiveBets, 1 / (0.2 ** 2 + 0.8 ** 2), 0.02);
    const sd = Math.sqrt(0.25 * (0.01 ** 2 + 0.02 ** 2) * (400 / 399));
    close(r.annualVol, sd * Math.sqrt(252), 1e-6);
    assert.ok(r.var99 >= r.var95 && r.cvar95 >= r.var95);
    close(r.var95, -quantile(a.map((x, i) => 0.5 * x + 0.5 * b[i]), 0.05), 1e-9);
    assert.equal(r.worstDays.length, 5);
    assert.ok(r.worstDays[0].return <= r.worstDays[4].return);
    assert.ok(r.diversificationRatio > 1);
    close(r.correlation.matrix[0][1], 0, 1e-9);
    assert.equal(r.beta, null);
});

test('riskReport: beta against itself is 1', () => {
    const dates = a.map((_, i) => `d${i}`);
    const port = a.map((x, i) => 0.5 * x + 0.5 * b[i]);
    const r = riskReport({ assets: [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }], returns: [a, b], dates, ppy: 252, benchmarkReturns: port });
    close(r.beta, 1, 1e-9);
    close(r.correlationToBenchmark, 1, 1e-9);
});

// ---------------------------------------------------------------- scanner

test('percentileRanks handles ties, nulls and single values', () => {
    assert.deepEqual(percentileRanks([1, 2, 3]), [0, 0.5, 1]);
    assert.deepEqual(percentileRanks([5, null, 5]), [0.5, null, 0.5]);
    assert.deepEqual(percentileRanks([7]), [0.5]);
});

test('scanAsset describes trend, momentum and volatility; rankAssets orders by score', () => {
    const up = makeCandles(320, { drift: 0.002, vol: 0.006, seed: 3 });
    const down = makeCandles(320, { drift: -0.002, vol: 0.006, seed: 3 });
    const rows = [{ symbol: 'DOWN', ...scanAsset(down, 252) }, { symbol: 'UP', ...scanAsset(up, 252) }];
    assert.ok(rows[1].return6m > 0 && rows[0].return6m < 0);
    assert.ok(rows[1].aboveSma200 === true && rows[0].aboveSma200 === false);
    assert.ok(rows[1].trendVotes > rows[0].trendVotes);
    const ranked = rankAssets(rows);
    assert.equal(ranked[0].symbol, 'UP');
    assert.ok(ranked[0].score > ranked[1].score);
});
