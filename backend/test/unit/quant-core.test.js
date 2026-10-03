'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../../src/services/quant/stats');
const { performance, drawdownSeries, equityFromReturns } = require('../../src/services/quant/metrics');
const { runBacktest, tradeStats } = require('../../src/services/quant/backtest');
const { STRATEGIES, getStrategy, resolveParams } = require('../../src/services/quant/strategies');
const { makeCandles } = require('../helpers/candles');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ------------------------------------------------------------------ stats

test('stats: mean, sample variance, covariance and correlation', () => {
    close(stats.mean([1, 2, 3, 4]), 2.5);
    close(stats.variance([1, 2, 3, 4]), 5 / 3);
    close(stats.covariance([1, 2, 3, 4], [2, 4, 6, 8]), 10 / 3);
    close(stats.correlation([1, 2, 3, 4], [8, 6, 4, 2]), -1);
    assert.equal(stats.correlation([1, 1, 1], [1, 2, 3]), 0);
});

test('stats: quantile interpolates and pctReturns handles zeros', () => {
    close(stats.quantile([1, 2, 3, 4, 5], 0.5), 3);
    close(stats.quantile([1, 2, 3, 4], 0.25), 1.75);
    assert.equal(stats.quantile([], 0.5), null);
    assert.deepEqual(stats.pctReturns([100, 110, 99]).map((x) => Number(x.toFixed(6))), [0.1, -0.1]);
});

// ---------------------------------------------------------------- metrics

test('metrics: total return, drawdown and annualisation on a known curve', () => {
    const p = performance([100, 110, 99, 121], 252);
    close(p.totalReturn, 0.21);
    close(p.maxDrawdown, 99 / 110 - 1);
    assert.equal(p.maxDrawdownBars, 1);
    close(p.years, 3 / 252);
    close(p.cagr, 1.21 ** (252 / 3) - 1, 1e-6);
    close(p.bestPeriod, 121 / 99 - 1);
    close(p.worstPeriod, -0.1);
});

test('metrics: a flat curve has zero Sharpe and drawdown', () => {
    const p = performance([100, 100, 100, 100], 252);
    assert.equal(p.sharpe, 0);
    assert.equal(p.maxDrawdown, 0);
    assert.equal(p.calmar, null);
});

test('metrics: sharpe scales with sqrt(periods per year) and sign follows the mean', () => {
    const eq = equityFromReturns([0.01, -0.005, 0.012, 0.003, -0.002, 0.008]);
    const daily = performance(eq, 252).sharpe;
    close(performance(eq, 365).sharpe / daily, Math.sqrt(365 / 252), 1e-9);
    assert.ok(performance(equityFromReturns([-0.01, 0.002, -0.012, -0.003]), 252).sharpe < 0);
});

test('metrics: drawdownSeries and equityFromReturns', () => {
    assert.deepEqual(drawdownSeries([100, 120, 90, 120, 130]).map((x) => Number(x.toFixed(4))), [0, 0, -0.25, 0, 0]);
    const eq = equityFromReturns([0.1, -0.1]);
    close(eq[2], 0.99);
});

// --------------------------------------------------------------- backtest

const bar = (date, open, close) => ({ date, open, high: Math.max(open, close), low: Math.min(open, close), close });
const FIVE = [bar('d0', 100, 100), bar('d1', 100, 110), bar('d2', 110, 121), bar('d3', 121, 100), bar('d4', 100, 100)];

test('backtest: signals decided at a close are executed at the NEXT open', () => {
    const r = runBacktest({ candles: FIVE, targets: [1, 1, 0, 0, 0] }, { initialCash: 10_000 });
    assert.equal(r.trades.length, 1);
    assert.equal(r.trades[0].entryDate, 'd1');
    assert.equal(r.trades[0].entryPrice, 100);
    assert.equal(r.trades[0].exitDate, 'd3');
    assert.equal(r.trades[0].exitPrice, 121);
    close(r.trades[0].return, 0.21);
    assert.deepEqual(r.equity.map((x) => Math.round(x)), [10000, 11000, 12100, 12100, 12100]);
});

test('backtest: commission and slippage are charged on both sides', () => {
    const r = runBacktest({ candles: FIVE, targets: [1, 1, 0, 0, 0] }, { initialCash: 10_000, commissionBps: 100, slippageBps: 50 });
    const entryPrice = 100 * 1.005;
    const shares = (10_000 / 1.01) / entryPrice;
    const proceeds = shares * 121 * (1 - 0.005) * 0.99;
    close(r.equity[4], proceeds, 1e-6);
    close(r.trades[0].entryPrice, entryPrice, 1e-9);
    const buyFee = 10_000 - 10_000 / 1.01;
    const buySlippage = shares * (entryPrice - 100);
    const sellGross = shares * 121 * 0.995;
    const sellFee = sellGross * 0.01;
    const sellSlippage = shares * (121 - 121 * 0.995);
    close(r.costs.fees, buyFee + sellFee, 1e-6);
    close(r.costs.slippage, buySlippage + sellSlippage, 1e-6);
    close(r.costs.total, buyFee + sellFee + buySlippage + sellSlippage, 1e-6);
});

test('backtest: costs reduce final equity versus a frictionless run', () => {
    const candles = makeCandles(300);
    const targets = candles.map((_, i) => (Math.floor(i / 7) % 2 === 0 ? 1 : 0));
    const free = runBacktest({ candles, targets }, {});
    const paid = runBacktest({ candles, targets }, { commissionBps: 10, slippageBps: 10 });
    assert.ok(paid.equity.at(-1) < free.equity.at(-1));
    assert.ok(paid.costs.total > 0 && free.costs.total === 0);
});

test('backtest: an open position at the end is reported and marked to market', () => {
    const r = runBacktest({ candles: FIVE, targets: [1, 1, 1, 1, 1] }, {});
    assert.equal(r.trades.length, 1);
    assert.equal(r.trades[0].open, true);
    close(r.trades[0].return, 0);
    close(r.exposure, 1);
});

test('backtest: fractional targets rebalance only outside the band', () => {
    const candles = [bar('d0', 100, 100), bar('d1', 100, 100), bar('d2', 100, 100), bar('d3', 100, 100), bar('d4', 100, 100)];
    const r = runBacktest({ candles, targets: [0.5, 0.55, 0.9, 0.9, 0.9] }, { rebalanceBand: 0.1 });
    close(r.weights[1], 0.5);
    close(r.weights[2], 0.5); // 0.55 target is inside the 10% band: no trade
    close(r.weights[3], 0.9); // 0.9 target is outside the band: rebalance
});

test('backtest: cannot spend more cash than it has and never goes negative', () => {
    const candles = makeCandles(200, { vol: 0.05 });
    const r = runBacktest({ candles, targets: candles.map(() => 1) }, { commissionBps: 200, slippageBps: 200 });
    assert.ok(r.equity.every((x) => x > 0));
    assert.ok(r.weights.every((w) => w <= 1 + 1e-9 && w >= 0));
});

test('backtest: tradeStats aggregates round trips', () => {
    const t = tradeStats([{ return: 0.1, bars: 5 }, { return: -0.05, bars: 3 }, { return: 0.2, bars: 10 }]);
    assert.equal(t.count, 3);
    close(t.winRate, 2 / 3);
    close(t.profitFactor, 0.3 / 0.05);
    close(t.avgBars, 6);
    assert.equal(tradeStats([]).count, 0);
});

// ------------------------------------------------------------- strategies

test('every strategy signal at bar i depends only on data up to bar i (no look-ahead)', () => {
    const candles = makeCandles(520, { seed: 99 });
    for (const strategy of STRATEGIES) {
        const params = resolveParams(strategy, {});
        const full = strategy.signals(candles, params, 252);
        assert.equal(full.length, candles.length, strategy.id);
        for (const cut of [210, 300, 451]) {
            const partial = strategy.signals(candles.slice(0, cut), params, 252);
            for (let i = 0; i < cut; i++) {
                assert.ok(Math.abs(partial[i] - full[i]) < 1e-12, `${strategy.id} bar ${i} changes when future bars are removed`);
            }
        }
    }
});

test('every strategy produces weights in [0, 1] for every grid combination', () => {
    const candles = makeCandles(400, { seed: 5 });
    for (const strategy of STRATEGIES) {
        const grid = strategy.grid();
        assert.ok(grid.length >= 1 && grid.length <= 60, `${strategy.id} grid size ${grid.length}`);
        for (const params of grid) {
            resolveParams(strategy, params); // grid points must satisfy the strategy's own validation
            assert.ok(strategy.signals(candles, params, 252).every((v) => v >= 0 && v <= 1 && Number.isFinite(v)), strategy.id);
        }
    }
});

test('sma_cross is long only while the fast average is above the slow average', () => {
    const up = Array.from({ length: 60 }, (_, i) => bar(`d${i}`, 100 + i, 100 + i));
    const down = Array.from({ length: 60 }, (_, i) => bar(`e${i}`, 160 - i, 160 - i));
    const sig = getStrategy('sma_cross').signals([...up, ...down], { fast: 5, slow: 20 });
    assert.equal(sig[10], 0); // still warming up
    assert.equal(sig[50], 1); // uptrend
    assert.equal(sig[119], 0); // after a long downtrend
});

test('donchian excludes the current bar from its own channel', () => {
    const candles = [...Array(10).fill(0).map((_, i) => bar(`d${i}`, 100, 100)), bar('jump', 100, 120)];
    const sig = getStrategy('donchian_breakout').signals(candles, { entry: 5, exit: 3 });
    assert.equal(sig[10], 1); // the 120 close breaks above the previous 5 closes
    assert.equal(sig[9], 0);
});

test('trend_vol_target sizes down when volatility is high', () => {
    const calm = makeCandles(300, { vol: 0.004, drift: 0.001, seed: 3 });
    const wild = makeCandles(300, { vol: 0.03, drift: 0.001, seed: 3 });
    const strategy = getStrategy('trend_vol_target');
    const params = { trend: 50, targetVol: 0.15, volWindow: 20 };
    const avg = (arr) => arr.filter((x) => x > 0).reduce((a, b) => a + b, 0) / Math.max(1, arr.filter((x) => x > 0).length);
    assert.ok(avg(strategy.signals(wild, params, 252)) < avg(strategy.signals(calm, params, 252)));
});

test('resolveParams applies defaults and rejects bad input', () => {
    const sma = getStrategy('sma_cross');
    assert.deepEqual(resolveParams(sma, {}), { fast: 20, slow: 50 });
    assert.throws(() => resolveParams(sma, { fast: 60, slow: 50 }), (e) => e.status === 400 && /shorter/.test(e.message));
    assert.throws(() => resolveParams(sma, { fast: 1.5 }), (e) => e.status === 400);
    assert.throws(() => resolveParams(sma, { fast: 1 }), (e) => e.status === 400);
    assert.throws(() => resolveParams(sma, { nope: 1 }), (e) => e.status === 400 && /Unknown parameter/.test(e.message));
    assert.throws(() => getStrategy('nope'), (e) => e.status === 400);
});
