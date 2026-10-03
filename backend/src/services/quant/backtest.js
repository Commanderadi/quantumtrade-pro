'use strict';

const { performance } = require('./metrics');
const { sum } = require('./stats');

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * Event-free daily backtest of a long/flat (or fractionally weighted) strategy.
 *
 * Timing is strictly causal: `targets[i]` is the weight decided with information
 * up to the CLOSE of bar i, and it is traded at the OPEN of bar i + 1. Commission
 * and slippage (basis points) are charged on every traded notional.
 *
 * @param candles  [{ date, open, high, low, close }]
 * @param targets  target portfolio weight (0..1) per bar
 * @param options  { initialCash, commissionBps, slippageBps, rebalanceBand }
 */
function runBacktest({ candles, targets }, options = {}) {
    const { initialCash = 10_000, commissionBps = 0, slippageBps = 0, rebalanceBand = 0.1 } = options;
    const n = candles.length;
    const fee = commissionBps / 1e4;
    const slip = slippageBps / 1e4;

    let cash = initialCash;
    let shares = 0;
    const equity = new Array(n).fill(initialCash);
    const weights = new Array(n).fill(0);
    const trades = [];
    let openTrade = null;
    let feesPaid = 0;
    let slippagePaid = 0;
    let turnover = 0;

    for (let i = 1; i < n; i++) {
        const bar = candles[i];
        const target = clamp01(targets[i - 1]);
        const valueAtOpen = shares * bar.open;
        const equityAtOpen = cash + valueAtOpen;
        const currentWeight = equityAtOpen > 0 ? valueAtOpen / equityAtOpen : 0;
        const isFlat = shares <= 1e-12;

        const mustExit = target === 0 && !isFlat;
        const mustEnter = target > 0 && isFlat;
        const rebalance = !isFlat && target > 0 && Math.abs(target - currentWeight) >= rebalanceBand;

        if (mustExit || mustEnter || rebalance) {
            const delta = mustExit ? -valueAtOpen : target * equityAtOpen - valueAtOpen;
            if (delta > 0) {
                const spend = Math.min(cash, delta);
                const notional = spend / (1 + fee);
                const execPrice = bar.open * (1 + slip);
                const bought = notional / execPrice;
                cash -= spend;
                shares += bought;
                feesPaid += spend - notional;
                slippagePaid += bought * (execPrice - bar.open);
                turnover += notional / equityAtOpen;
                if (isFlat && bought > 0) {
                    openTrade = { entryIndex: i, entryDate: bar.date, entryPrice: execPrice, equityBefore: equityAtOpen };
                }
            } else if (delta < 0) {
                const sold = mustExit ? shares : Math.min(shares, -delta / bar.open);
                const execPrice = bar.open * (1 - slip);
                const gross = sold * execPrice;
                const proceeds = gross * (1 - fee);
                cash += proceeds;
                shares = mustExit ? 0 : shares - sold;
                feesPaid += gross - proceeds;
                slippagePaid += sold * (bar.open - execPrice);
                turnover += (sold * bar.open) / equityAtOpen;
                if (mustExit && openTrade) {
                    trades.push({
                        entryDate: openTrade.entryDate,
                        exitDate: bar.date,
                        entryPrice: openTrade.entryPrice,
                        exitPrice: execPrice,
                        bars: i - openTrade.entryIndex,
                        return: cash / openTrade.equityBefore - 1,
                        open: false,
                    });
                    openTrade = null;
                }
            }
        }

        equity[i] = cash + shares * bar.close;
        weights[i] = equity[i] > 0 ? (shares * bar.close) / equity[i] : 0;
    }

    if (openTrade) {
        const last = candles[n - 1];
        trades.push({
            entryDate: openTrade.entryDate,
            exitDate: last.date,
            entryPrice: openTrade.entryPrice,
            exitPrice: last.close,
            bars: n - 1 - openTrade.entryIndex,
            return: equity[n - 1] / openTrade.equityBefore - 1,
            open: true,
        });
    }

    return {
        equity,
        weights,
        trades,
        costs: { fees: feesPaid, slippage: slippagePaid, total: feesPaid + slippagePaid, percentOfCapital: (feesPaid + slippagePaid) / initialCash },
        turnover,
        exposure: n > 1 ? sum(weights.slice(1)) / (n - 1) : 0,
    };
}

/** Round-trip trade statistics. */
function tradeStats(trades) {
    const closed = trades;
    if (!closed.length) {
        return { count: 0, winRate: null, avgReturn: null, avgWin: null, avgLoss: null, profitFactor: null, avgBars: null, best: null, worst: null };
    }
    const wins = closed.filter((t) => t.return > 0);
    const losses = closed.filter((t) => t.return <= 0);
    const grossWin = sum(wins.map((t) => t.return));
    const grossLoss = Math.abs(sum(losses.map((t) => t.return)));
    return {
        count: closed.length,
        winRate: wins.length / closed.length,
        avgReturn: sum(closed.map((t) => t.return)) / closed.length,
        avgWin: wins.length ? grossWin / wins.length : null,
        avgLoss: losses.length ? -grossLoss / losses.length : null,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
        avgBars: sum(closed.map((t) => t.bars)) / closed.length,
        best: Math.max(...closed.map((t) => t.return)),
        worst: Math.min(...closed.map((t) => t.return)),
    };
}

/** Runs a backtest and attaches performance and trade statistics. */
function backtestWithMetrics(input, options, ppy, riskFree = 0) {
    const result = runBacktest(input, options);
    return { ...result, metrics: performance(result.equity, ppy, riskFree), tradeStats: tradeStats(result.trades) };
}

module.exports = { runBacktest, tradeStats, backtestWithMetrics };
