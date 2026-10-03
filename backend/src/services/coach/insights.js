'use strict';

const DAY = 86_400_000;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const days = (a, b) => (new Date(b) - new Date(a)) / DAY;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

/**
 * Plain-language behaviour checks on a practice account.
 * @param trades    chronological: { side, symbol, reason, dayChangePct, executedAt, fee }
 * @param lots      { reason, quantity, quantityOpen, unitCost, openedAt, closedAt, realizedPnl, symbol }
 * @param positions valued open positions: { symbol, value }
 * @param account   { startingCash, totalValue, mirrorValue, mirrorComplete }
 */
function detectBehaviours({ trades, lots, positions, account }) {
    const out = [];
    const buys = trades.filter((t) => t.side === 'buy');
    const sells = trades.filter((t) => t.side === 'sell');

    // 1. Overtrading
    const perDay = new Map();
    for (const t of trades) perDay.set(dayKey(t.executedAt), (perDay.get(dayKey(t.executedAt)) ?? 0) + 1);
    const busiest = Math.max(0, ...perDay.values());
    if (busiest >= 6) {
        out.push({ id: 'overtrading', severity: 'warning', lesson: 'overtrading', title: 'You trade a lot in a single day', detail: `Your busiest day had ${busiest} trades. Frequent trading mostly adds costs.` });
    }

    // 2. Chasing rallies
    const chased = buys.filter((t) => t.dayChangePct !== null && t.dayChangePct >= 5);
    if (chased.length >= 2 || (chased.length >= 1 && chased.length / Math.max(1, buys.length) >= 0.3)) {
        const symbols = [...new Set(chased.map((t) => t.symbol))].slice(0, 5).join(', ');
        out.push({ id: 'chasing', severity: 'warning', lesson: 'chasing', title: 'Buying after big jumps', detail: `${chased.length} of your buys came on days the price was already up 5% or more (${symbols}).` });
    }

    // 3. Panic selling: selling on a big down day, or dumping a fresh position at a loss.
    const downDaySells = sells.filter((t) => t.dayChangePct !== null && t.dayChangePct <= -5);
    const quickLosses = lots.filter((l) => {
        const closedQty = Number(l.quantity) - Number(l.quantityOpen);
        if (!(closedQty > 0) || !l.closedAt) return false;
        const cost = closedQty * Number(l.unitCost);
        return cost > 0 && Number(l.realizedPnl) / cost <= -0.08 && days(l.openedAt, l.closedAt) <= 10;
    });
    if (downDaySells.length + quickLosses.length >= 1) {
        out.push({
            id: 'panic_selling', severity: 'warning', lesson: 'panic_selling', title: 'Possible panic selling',
            detail: [
                downDaySells.length ? `${downDaySells.length} sell(s) on days the price fell 5% or more` : null,
                quickLosses.length ? `${quickLosses.length} position(s) sold at a loss of 8% or more within 10 days of buying` : null,
            ].filter(Boolean).join('; ') + '.',
        });
    }

    // 4. Concentration
    const total = account.totalValue;
    if (positions.length && total > 0) {
        const biggest = positions.reduce((a, b) => (b.value > a.value ? b : a));
        const share = biggest.value / total;
        if (share > 0.4) {
            out.push({ id: 'concentration', severity: 'warning', lesson: 'diversification', title: `${biggest.symbol} is ${pct(share)} of your account`, detail: 'One position this large means one bad result can hurt your whole account.' });
        }
    }

    // 5. Disposition effect
    const closed = lots.filter((l) => l.closedAt && Number(l.quantityOpen) === 0);
    const winners = closed.filter((l) => Number(l.realizedPnl) > 0);
    const losers = closed.filter((l) => Number(l.realizedPnl) <= 0);
    const avgHold = (arr) => arr.reduce((s, l) => s + days(l.openedAt, l.closedAt), 0) / arr.length;
    if (winners.length >= 3 && losers.length >= 3 && avgHold(losers) > avgHold(winners) * 1.5 + 1) {
        out.push({ id: 'disposition', severity: 'info', lesson: 'disposition', title: 'You hold losers longer than winners', detail: `Winners were held ${avgHold(winners).toFixed(1)} days on average, losers ${avgHold(losers).toFixed(1)} days.` });
    }

    // 6. Tips
    const tipBuys = buys.filter((t) => t.reason === 'tip');
    if (tipBuys.length >= 3 || (buys.length >= 4 && tipBuys.length / buys.length >= 0.5)) {
        out.push({ id: 'tips', severity: 'warning', lesson: 'tips', title: 'Many trades based on tips', detail: `${tipBuys.length} of ${buys.length} buys were tips. Check the "Why you traded" scoreboard to see how they did.` });
    }

    // 7. Costs
    const fees = trades.reduce((s, t) => s + Number(t.fee), 0);
    const realized = lots.reduce((s, l) => s + Number(l.realizedPnl), 0);
    if (fees > account.startingCash * 0.005 && fees > Math.abs(realized) * 0.25) {
        out.push({ id: 'fees', severity: 'info', lesson: 'fees', title: 'Costs are eating your results', detail: `You have paid ${fees.toFixed(0)} in costs against ${realized.toFixed(0)} of realised profit.` });
    }

    // 8. Benchmark comparison
    if (trades.length >= 5 && account.mirrorComplete && account.mirrorValue > 0) {
        const gap = (account.totalValue - account.mirrorValue) / account.startingCash;
        if (gap < -0.02) {
            out.push({ id: 'behind_benchmark', severity: 'info', lesson: 'index_funds', title: 'The index is beating you', detail: `Putting the same money into the index would have done ${pct(-gap)} of your starting money better.` });
        }
    }

    if (!out.length && trades.length >= 5) {
        out.push({ id: 'good_habits', severity: 'good', lesson: 'drawdown', title: 'No bad habits detected so far', detail: 'Keep journalling your reasons. Patience and small position sizes are what protect you in a downturn.' });
    }
    return out;
}

/** Realised and open results grouped by the reason given when buying. */
function reasonScoreboard(lots, priceBySymbol) {
    const groups = new Map();
    for (const l of lots) {
        const g = groups.get(l.reason) ?? { reason: l.reason, lots: 0, closedLots: 0, wins: 0, realizedPnl: 0, invested: 0, openPnl: 0 };
        g.lots += 1;
        const closedQty = Number(l.quantity) - Number(l.quantityOpen);
        if (closedQty > 0) {
            g.closedLots += 1;
            if (Number(l.realizedPnl) > 0) g.wins += 1;
            g.realizedPnl += Number(l.realizedPnl);
        }
        g.invested += Number(l.quantity) * Number(l.unitCost);
        const price = priceBySymbol.get(`${l.assetType}:${l.symbol}`);
        if (price !== undefined && Number(l.quantityOpen) > 0) g.openPnl += Number(l.quantityOpen) * (price - Number(l.unitCost));
        groups.set(l.reason, g);
    }
    return [...groups.values()]
        .map((g) => ({
            ...g,
            winRate: g.closedLots ? g.wins / g.closedLots : null,
            totalPnl: g.realizedPnl + g.openPnl,
            returnOnInvested: g.invested > 0 ? (g.realizedPnl + g.openPnl) / g.invested : null,
        }))
        .sort((a, b) => b.totalPnl - a.totalPnl);
}

module.exports = { detectBehaviours, reasonScoreboard };
