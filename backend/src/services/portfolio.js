'use strict';

const { toUnits, fromUnits, mul, div } = require('../utils/money');
const { unprocessable } = require('../utils/httpError');

/**
 * Replays a position's transactions (sorted by executed_at, id) using the
 * average-cost method. Fees on buys are added to cost basis; fees on sells
 * reduce realized P&L. Throws if a sell would exceed the quantity held at
 * that point in time.
 */
function replayPosition(transactions) {
    let quantity = 0n;
    let averageCost = 0n;
    let realized = 0n;
    const realizedByTx = new Map();

    for (const tx of transactions) {
        const q = toUnits(tx.quantity);
        const p = toUnits(tx.price);
        const fee = toUnits(tx.fee ?? 0);
        if (tx.side === 'buy') {
            const newQuantity = quantity + q;
            averageCost = div(mul(quantity, averageCost) + mul(q, p) + fee, newQuantity);
            quantity = newQuantity;
        } else {
            if (q > quantity) {
                throw unprocessable(
                    `Cannot sell ${fromUnits(q)} ${tx.symbol}: only ${fromUnits(quantity)} held on ${new Date(tx.executed_at).toISOString().slice(0, 10)}`
                );
            }
            const pnl = mul(q, p - averageCost) - fee;
            realized += pnl;
            realizedByTx.set(tx.id, fromUnits(pnl));
            quantity -= q;
            if (quantity === 0n) averageCost = 0n;
        }
    }
    return {
        quantity: fromUnits(quantity),
        averageCost: fromUnits(averageCost),
        realizedPnl: fromUnits(realized),
        isOpen: quantity > 0n,
        realizedByTx,
    };
}

/** Serialises portfolio writes per user so concurrent requests can't oversell. */
async function lockUser(conn, userId) {
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
}

/** Recomputes the holding row for one asset from its full transaction history. Must run inside a DB transaction. */
async function rebuildHolding(conn, userId, assetType, symbol) {
    const [txs] = await conn.execute(
        `SELECT id, symbol, side, quantity, price, fee, currency, executed_at
           FROM transactions
          WHERE user_id = ? AND asset_type = ? AND symbol = ?
          ORDER BY executed_at, id`,
        [userId, assetType, symbol]
    );
    if (txs.length === 0) {
        await conn.execute('DELETE FROM holdings WHERE user_id = ? AND asset_type = ? AND symbol = ?', [userId, assetType, symbol]);
        return null;
    }
    const position = replayPosition(txs);
    for (const tx of txs) {
        const pnl = tx.side === 'sell' ? position.realizedByTx.get(tx.id) : null;
        await conn.execute('UPDATE transactions SET realized_pnl = ? WHERE id = ?', [pnl, tx.id]);
    }
    // Closed positions keep their row so realized P&L stays visible.
    await conn.execute(
        `INSERT INTO holdings (user_id, symbol, asset_type, quantity, average_cost, currency, realized_pnl)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), average_cost = VALUES(average_cost),
                                 currency = VALUES(currency), realized_pnl = VALUES(realized_pnl)`,
        [userId, symbol, assetType, position.quantity, position.averageCost, txs[0].currency, position.realizedPnl]
    );
    return position;
}

const round = (n, dp = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** dp) / 10 ** dp);

/**
 * Values each open holding at its latest quote and aggregates totals per
 * currency (stocks listed in INR and crypto priced in USD are never summed together).
 */
async function valuePortfolio(holdings, market, displayCurrency = null) {
    const open = holdings.filter((h) => toUnits(h.quantity) > 0n);
    const byType = { stock: [], crypto: [] };
    for (const h of open) byType[h.asset_type].push(h.symbol);

    const quoteMaps = {};
    const quoteErrors = {};
    for (const type of ['stock', 'crypto']) {
        if (!byType[type].length) continue;
        const { quotes, errors } = await market.getQuotes(type, byType[type]);
        quoteMaps[type] = quotes;
        quoteErrors[type] = errors;
    }

    const totals = {};
    const positions = holdings.map((h) => {
        const quantity = Number(h.quantity);
        const costBasis = Number(fromUnits(mul(toUnits(h.quantity), toUnits(h.average_cost))));
        const quote = quoteMaps[h.asset_type]?.get(h.symbol) ?? null;
        const isOpen = quantity > 0;
        const marketValue = isOpen && quote ? quantity * quote.price : null;
        const unrealized = marketValue === null ? null : marketValue - costBasis;
        const dayChange = isOpen && quote && quote.change !== null ? quantity * quote.change : null;

        const t = (totals[h.currency] ??= {
            currency: h.currency, costBasis: 0, marketValue: 0, unrealizedPnl: 0, realizedPnl: 0, dayChange: 0, pricedPositions: 0, unpricedPositions: 0,
        });
        t.realizedPnl += Number(h.realized_pnl);
        if (isOpen) {
            if (marketValue === null) {
                t.unpricedPositions += 1;
            } else {
                t.pricedPositions += 1;
                t.costBasis += costBasis;
                t.marketValue += marketValue;
                t.unrealizedPnl += unrealized;
                t.dayChange += dayChange ?? 0;
            }
        }

        return {
            symbol: h.symbol,
            assetType: h.asset_type,
            currency: h.currency,
            quantity: h.quantity,
            averageCost: h.average_cost,
            costBasis: round(costBasis),
            realizedPnl: round(Number(h.realized_pnl)),
            isOpen,
            price: quote?.price ?? null,
            priceAsOf: quote?.asOf ?? null,
            changePercent: quote?.changePercent ?? null,
            marketValue: round(marketValue),
            unrealizedPnl: round(unrealized),
            unrealizedPnlPercent: unrealized !== null && costBasis > 0 ? round((unrealized / costBasis) * 100) : null,
            dayChange: round(dayChange),
            quoteError: isOpen && !quote ? quoteErrors[h.asset_type]?.get(h.symbol) ?? 'Quote unavailable' : null,
            allocationPercent: null,
        };
    });

    for (const p of positions) {
        const t = totals[p.currency];
        if (p.marketValue !== null && t.marketValue > 0) p.allocationPercent = round((p.marketValue / t.marketValue) * 100);
    }

    const totalsList = Object.values(totals).map((t) => {
        const previousValue = t.marketValue - t.dayChange;
        return {
            ...t,
            costBasis: round(t.costBasis),
            marketValue: round(t.marketValue),
            unrealizedPnl: round(t.unrealizedPnl),
            unrealizedPnlPercent: t.costBasis > 0 ? round((t.unrealizedPnl / t.costBasis) * 100) : null,
            realizedPnl: round(t.realizedPnl),
            dayChange: round(t.dayChange),
            dayChangePercent: previousValue > 0 ? round((t.dayChange / previousValue) * 100) : null,
        };
    });

    const combined = displayCurrency ? await combineTotals(totalsList, market, displayCurrency) : null;
    return { positions, totals: totalsList, combined };
}

/**
 * Converts each per-currency total into `currency` at today's exchange rate and
 * adds them up. Unrealized P&L uses today's rate for both cost and value, so it
 * does not include currency moves since purchase.
 */
async function combineTotals(totals, market, currency) {
    const sum = { currency, costBasis: 0, marketValue: 0, unrealizedPnl: 0, realizedPnl: 0, dayChange: 0 };
    const rates = {};
    const missing = [];
    for (const t of totals) {
        let rate;
        try {
            rate = await market.fxRate(t.currency, currency);
        } catch {
            missing.push(t.currency);
            continue;
        }
        rates[t.currency] = rate;
        for (const key of ['costBasis', 'marketValue', 'unrealizedPnl', 'realizedPnl', 'dayChange']) sum[key] += t[key] * rate;
    }
    const previousValue = sum.marketValue - sum.dayChange;
    return {
        currency,
        costBasis: round(sum.costBasis),
        marketValue: round(sum.marketValue),
        unrealizedPnl: round(sum.unrealizedPnl),
        unrealizedPnlPercent: sum.costBasis > 0 ? round((sum.unrealizedPnl / sum.costBasis) * 100) : null,
        realizedPnl: round(sum.realizedPnl),
        dayChange: round(sum.dayChange),
        dayChangePercent: previousValue > 0 ? round((sum.dayChange / previousValue) * 100) : null,
        rates,
        missingRates: missing,
    };
}

module.exports = { replayPosition, lockUser, rebuildHolding, valuePortfolio };
