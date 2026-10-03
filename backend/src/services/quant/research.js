'use strict';

const { performance, drawdownSeries, equityFromReturns } = require('./metrics');
const { backtestWithMetrics, tradeStats } = require('./backtest');
const { warmupBars } = require('./strategies');
const { badRequest } = require('../../utils/httpError');

const MIN_BARS = 150;
const MAX_CHART_POINTS = 600;

const round = (x, dp = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp);

function assertEnoughHistory(candles) {
    if (candles.length < MIN_BARS) {
        throw badRequest(
            `Only ${candles.length} daily bars are available; at least ${MIN_BARS} are needed for a meaningful backtest. ` +
                'A Twelve Data key provides several years of stock history; crypto uses one year from CoinGecko.'
        );
    }
}

const slice = (candles, targets, from, to) => ({ candles: candles.slice(from, to), targets: targets.slice(from, to) });
const ones = (n) => new Array(n).fill(1);

function runSegment(candles, targets, from, to, options, ppy) {
    return backtestWithMetrics(slice(candles, targets, from, to), options, ppy);
}

/** Trims a metrics object to a compact, JSON-friendly shape. */
function publicMetrics(m) {
    return {
        bars: m.bars,
        years: round(m.years, 2),
        totalReturn: round(m.totalReturn),
        cagr: round(m.cagr),
        annualVol: round(m.annualVol),
        sharpe: round(m.sharpe, 2),
        sortino: round(m.sortino, 2),
        maxDrawdown: round(m.maxDrawdown),
        maxDrawdownBars: m.maxDrawdownBars,
        calmar: round(m.calmar, 2),
        tStat: round(m.tStat, 2),
    };
}

function publicTradeStats(t) {
    return {
        count: t.count,
        winRate: round(t.winRate),
        avgReturn: round(t.avgReturn),
        avgWin: round(t.avgWin),
        avgLoss: round(t.avgLoss),
        profitFactor: round(t.profitFactor, 2),
        avgBars: round(t.avgBars, 1),
        best: round(t.best),
        worst: round(t.worst),
    };
}

/** Downsamples chart rows so responses stay small for multi-year histories. */
function downsample(rows, max = MAX_CHART_POINTS) {
    if (rows.length <= max) return rows;
    const step = rows.length / max;
    const out = [];
    for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)]);
    if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
    return out;
}

function chartSeries(candles, strat, bench, initial) {
    const dd = drawdownSeries(strat.equity);
    const bdd = drawdownSeries(bench.equity);
    return downsample(
        candles.map((c, i) => ({
            date: c.date,
            strategy: round(strat.equity[i] / initial),
            buyHold: round(bench.equity[i] / initial),
            drawdown: round(dd[i]),
            buyHoldDrawdown: round(bdd[i]),
            exposure: round(strat.weights[i], 2),
        }))
    );
}

/**
 * Plain-language verdict on whether the out-of-sample result shows an edge over buy-and-hold.
 * This is deliberately conservative: backtests flatter strategies.
 */
function verdict({ oos, bench, totalTrades, inSampleSharpe }) {
    const reasons = [];
    if (oos.bars < 60) {
        return { rating: 'inconclusive', reasons: ['Less than 60 out-of-sample days — far too little data to judge.'] };
    }
    const beatsSharpe = oos.sharpe > bench.sharpe;
    const degraded = inSampleSharpe > 0 && oos.sharpe < inSampleSharpe * 0.5;
    if (!beatsSharpe) reasons.push(`Out-of-sample Sharpe ${oos.sharpe.toFixed(2)} did not beat buy-and-hold (${bench.sharpe.toFixed(2)}).`);
    if (oos.sharpe <= 0) reasons.push('The strategy lost money after costs out of sample.');
    if (degraded) reasons.push(`Sharpe fell from ${inSampleSharpe.toFixed(2)} in-sample to ${oos.sharpe.toFixed(2)} out-of-sample — a typical sign of overfitting.`);
    if (totalTrades < 10) reasons.push(`Only ${totalTrades} trades: too few to be statistically meaningful.`);
    if (Math.abs(oos.tStat) < 2) reasons.push(`t-statistic ${oos.tStat.toFixed(2)} (< 2): the result is not statistically distinguishable from luck.`);

    if (!beatsSharpe || oos.sharpe <= 0) return { rating: 'no_edge', reasons };
    if (!degraded && totalTrades >= 10 && Math.abs(oos.tStat) >= 2) {
        return { rating: 'promising', reasons: [`Beat buy-and-hold out of sample (Sharpe ${oos.sharpe.toFixed(2)} vs ${bench.sharpe.toFixed(2)}) with a significant t-statistic.`, 'Still verify on other assets and periods before risking money.'] };
    }
    return { rating: 'inconclusive', reasons };
}

/**
 * Backtests one parameter set with a fixed in-sample / out-of-sample split.
 * Parameters are NOT tuned on the out-of-sample segment.
 */
function evaluateStrategy({ candles, strategy, params, ppy, costs, split = 0.7 }) {
    assertEnoughHistory(candles);
    const n = candles.length;
    const k = Math.max(2, Math.min(n - 2, Math.floor(n * split)));
    const targets = strategy.signals(candles, params, ppy);
    const bTargets = ones(n);

    const full = runSegment(candles, targets, 0, n, costs, ppy);
    const bench = runSegment(candles, bTargets, 0, n, costs, ppy);
    const isRun = runSegment(candles, targets, 0, k, costs, ppy);
    const isBench = runSegment(candles, bTargets, 0, k, costs, ppy);
    // The OOS segment starts one bar early so that the first out-of-sample bar is tradable.
    const oosRun = runSegment(candles, targets, k - 1, n, costs, ppy);
    const oosBench = runSegment(candles, bTargets, k - 1, n, costs, ppy);

    const warnings = [];
    const warmup = warmupBars(params);
    if (warmup > k * 0.5) warnings.push(`These parameters need ${warmup} bars of history; more than half of the in-sample period is warm-up.`);
    if (full.costs.percentOfCapital > 0.1) warnings.push(`Trading costs consumed ${(full.costs.percentOfCapital * 100).toFixed(0)}% of starting capital; the strategy trades too often for these costs.`);

    return {
        strategy: strategy.id,
        params,
        period: { from: candles[0].date, to: candles[n - 1].date, bars: n, splitDate: candles[k].date },
        full: { metrics: publicMetrics(full.metrics), trades: publicTradeStats(full.tradeStats), costs: { ...full.costs, total: round(full.costs.total, 2), percentOfCapital: round(full.costs.percentOfCapital) }, exposure: round(full.exposure, 2), turnover: round(full.turnover, 2) },
        inSample: { metrics: publicMetrics(isRun.metrics), buyHold: publicMetrics(isBench.metrics), trades: publicTradeStats(isRun.tradeStats) },
        outOfSample: { metrics: publicMetrics(oosRun.metrics), buyHold: publicMetrics(oosBench.metrics), trades: publicTradeStats(oosRun.tradeStats) },
        buyHold: publicMetrics(bench.metrics),
        verdict: strategy.id === 'buy_hold'
            ? { rating: 'baseline', reasons: ['This is the benchmark itself.'] }
            : verdict({ oos: oosRun.metrics, bench: oosBench.metrics, totalTrades: full.trades.length, inSampleSharpe: isRun.metrics.sharpe }),
        warnings,
        series: chartSeries(candles, full, bench, costs.initialCash ?? 10_000),
        trades: full.trades.slice(-40).map((t) => ({ ...t, entryPrice: round(t.entryPrice, 4), exitPrice: round(t.exitPrice, 4), return: round(t.return) })),
    };
}

/** Picks the grid point with the best Sharpe on the training window (needs a minimum number of trades). */
function pickBest(candidates, minTrades) {
    const eligible = candidates.filter((c) => c.trades >= minTrades);
    const pool = eligible.length ? eligible : candidates;
    return { best: pool.reduce((a, b) => (b.sharpe > a.sharpe ? b : a)), usedFallback: eligible.length === 0 };
}

/**
 * Searches the strategy's parameter grid on the IN-SAMPLE window only, then reports how the
 * winner does out of sample. Also reports the Sharpe you would expect from pure luck when
 * picking the best of N trials, so a flattering in-sample number can be judged fairly.
 */
function optimizeStrategy({ candles, strategy, ppy, costs, split = 0.7 }) {
    assertEnoughHistory(candles);
    const n = candles.length;
    const k = Math.max(2, Math.min(n - 2, Math.floor(n * split)));
    const combos = strategy.grid();
    const trials = combos.map((params) => {
        const targets = strategy.signals(candles, params, ppy);
        const run = runSegment(candles, targets, 0, k, costs, ppy);
        return { params, sharpe: run.metrics.sharpe, totalReturn: run.metrics.totalReturn, maxDrawdown: run.metrics.maxDrawdown, trades: run.trades.length };
    });
    const { best, usedFallback } = pickBest(trials, 5);
    const isYears = (k - 1) / ppy;
    const luckSharpe = trials.length > 1 && isYears > 0 ? Math.sqrt(2 * Math.log(trials.length)) / Math.sqrt(isYears) : 0;

    const evaluation = evaluateStrategy({ candles, strategy, params: best.params, ppy, costs, split });
    const ranking = [...trials].sort((a, b) => b.sharpe - a.sharpe).slice(0, 10).map((t) => ({
        params: t.params, sharpe: round(t.sharpe, 2), totalReturn: round(t.totalReturn), maxDrawdown: round(t.maxDrawdown), trades: t.trades,
    }));

    const warnings = [...evaluation.warnings];
    if (usedFallback) warnings.push('No parameter set made at least 5 in-sample trades; the best of the rest was used.');
    if (best.sharpe <= luckSharpe) warnings.push(`In-sample Sharpe ${best.sharpe.toFixed(2)} is no better than the ~${luckSharpe.toFixed(2)} you'd expect from luck when trying ${trials.length} settings.`);

    return {
        ...evaluation,
        warnings,
        optimization: { trials: trials.length, objective: 'in-sample Sharpe ratio', best: { params: best.params, sharpe: round(best.sharpe, 2) }, luckSharpe: round(luckSharpe, 2), ranking },
    };
}

/**
 * Walk-forward test: repeatedly optimise on a training window, then trade the NEXT unseen window
 * with those parameters. The stitched out-of-sample result is the most honest estimate here.
 */
function walkForward({ candles, strategy, ppy, costs, trainBars, testBars }) {
    assertEnoughHistory(candles);
    const n = candles.length;
    const train = trainBars ?? Math.floor(n * 0.5);
    const test = testBars ?? Math.max(20, Math.floor(n * 0.1));
    if (train < 60 || train + test > n) throw badRequest(`Walk-forward needs a training window of at least 60 bars and train + test within the ${n} available bars.`);

    const combos = strategy.grid();
    const targetsByCombo = combos.map((params) => ({ params, targets: strategy.signals(candles, params, ppy) }));
    const folds = [];
    const oosReturns = [];
    const benchReturns = [];

    for (let start = 0; start + train + test <= n; start += test) {
        const trainFrom = start;
        const trainTo = start + train;
        const testTo = Math.min(n, trainTo + test);
        const trials = targetsByCombo.map(({ params, targets }) => {
            const run = runSegment(candles, targets, trainFrom, trainTo, costs, ppy);
            return { params, targets, sharpe: run.metrics.sharpe, trades: run.trades.length };
        });
        const { best } = pickBest(trials, 3);
        const oos = runSegment(candles, best.targets, trainTo - 1, testTo, costs, ppy);
        const bench = runSegment(candles, ones(n), trainTo - 1, testTo, costs, ppy);
        for (let i = 1; i < oos.equity.length; i++) {
            oosReturns.push(oos.equity[i] / oos.equity[i - 1] - 1);
            benchReturns.push(bench.equity[i] / bench.equity[i - 1] - 1);
        }
        folds.push({
            trainFrom: candles[trainFrom].date, trainTo: candles[trainTo - 1].date, testFrom: candles[trainTo].date, testTo: candles[testTo - 1].date,
            params: best.params, inSampleSharpe: round(best.sharpe, 2), outOfSampleReturn: round(oos.metrics.totalReturn), buyHoldReturn: round(bench.metrics.totalReturn), trades: oos.trades.length,
        });
    }
    if (!folds.length) throw badRequest('Not enough history for a single walk-forward fold.');

    const stitched = equityFromReturns(oosReturns);
    const benchStitched = equityFromReturns(benchReturns);
    const oosMetrics = performance(stitched, ppy);
    const benchMetrics = performance(benchStitched, ppy);
    const key = (p) => JSON.stringify(p);
    const counts = new Map();
    for (const f of folds) counts.set(key(f.params), (counts.get(key(f.params)) ?? 0) + 1);
    const stability = Math.max(...counts.values()) / folds.length;
    const avgIsSharpe = folds.reduce((s, f) => s + f.inSampleSharpe, 0) / folds.length;
    const firstTestIndex = candles.findIndex((c) => c.date === folds[0].testFrom);
    const dates = candles.slice(firstTestIndex - 1, firstTestIndex - 1 + stitched.length).map((c) => c.date);
    const totalTrades = folds.reduce((s, f) => s + f.trades, 0);

    const warnings = [];
    if (folds.length < 3) warnings.push('Fewer than 3 folds: walk-forward results are fragile.');
    if (stability < 0.5) warnings.push('The best parameters change from fold to fold — the strategy is not stable.');

    return {
        strategy: strategy.id,
        windows: { trainBars: train, testBars: test, folds: folds.length },
        outOfSample: { metrics: publicMetrics(oosMetrics), buyHold: publicMetrics(benchMetrics), trades: totalTrades },
        parameterStability: round(stability, 2),
        verdict: verdict({ oos: oosMetrics, bench: benchMetrics, totalTrades, inSampleSharpe: avgIsSharpe }),
        warnings,
        folds,
        series: downsample(stitched.map((v, i) => ({ date: dates[i], strategy: round(v), buyHold: round(benchStitched[i]) }))),
    };
}

module.exports = { evaluateStrategy, optimizeStrategy, walkForward, verdict, tradeStats, MIN_BARS };
