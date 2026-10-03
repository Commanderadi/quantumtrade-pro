'use strict';

const { rsi, sma } = require('../indicators');
const { std, pctReturns } = require('./stats');
const { STRATEGIES } = require('./strategies');

const TREND_STRATEGIES = STRATEGIES.filter((s) => s.family === 'trend');

const ret = (closes, bars) => (closes.length > bars ? closes[closes.length - 1] / closes[closes.length - 1 - bars] - 1 : null);

/** Descriptive statistics and strategy states for one asset (no prediction implied). */
function scanAsset(candles, ppy) {
    const closes = candles.map((c) => c.close);
    const last = closes[closes.length - 1];
    const r = rsi(closes, 14);
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const high52 = Math.max(...closes.slice(-Math.min(closes.length, ppy)));
    const vol60 = closes.length > 61 ? std(pctReturns(closes.slice(-61))) * Math.sqrt(ppy) : null;

    const states = TREND_STRATEGIES.map((s) => {
        const params = Object.fromEntries(s.params.map((p) => [p.key, p.default]));
        const targets = s.signals(candles, params, ppy);
        return { strategy: s.id, name: s.name, long: targets[targets.length - 1] > 0 };
    });

    return {
        price: last,
        return1m: ret(closes, 21),
        return3m: ret(closes, 63),
        return6m: ret(closes, 126),
        return12m: ret(closes, 252),
        vol60,
        rsi14: r[r.length - 1],
        aboveSma50: s50[s50.length - 1] !== null ? last > s50[s50.length - 1] : null,
        aboveSma200: s200[s200.length - 1] !== null ? last > s200[s200.length - 1] : null,
        drawdownFromHigh: last / high52 - 1,
        trendVotes: states.filter((s) => s.long).length,
        trendVotesTotal: states.length,
        states,
    };
}

/** Percentile rank in [0, 1] of each value among the non-null values (null stays null). */
function percentileRanks(values) {
    const valid = values.filter((v) => v !== null);
    return values.map((v) => {
        if (v === null) return null;
        if (valid.length < 2) return 0.5;
        const below = valid.filter((x) => x < v).length;
        const equal = valid.filter((x) => x === v).length;
        return (below + (equal - 1) / 2) / (valid.length - 1);
    });
}

/**
 * Ranks scanned assets with a transparent heuristic: the average of 3-month and 6-month momentum
 * ranks, trend agreement and low volatility. It describes recent behaviour; it does not forecast returns.
 */
function rankAssets(rows) {
    const m3 = percentileRanks(rows.map((r) => r.return3m));
    const m6 = percentileRanks(rows.map((r) => r.return6m));
    const lowVol = percentileRanks(rows.map((r) => (r.vol60 === null ? null : -r.vol60)));
    return rows
        .map((r, i) => {
            const parts = [m3[i], m6[i], r.trendVotes / r.trendVotesTotal, lowVol[i]].filter((x) => x !== null);
            return { ...r, score: parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : null };
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

module.exports = { scanAsset, rankAssets, percentileRanks };
