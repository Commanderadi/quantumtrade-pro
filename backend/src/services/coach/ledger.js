'use strict';

const { toUnits, fromUnits, mul, div } = require('../../utils/money');

/**
 * Closes `quantity` from open lots first-in-first-out.
 * @param lots         open lots, oldest first: { id, quantityOpen, unitCost } (decimal strings)
 * @param quantity     quantity to sell (decimal string)
 * @param proceedsUnit net sale proceeds per unit after fees, in base currency (decimal string)
 * @returns { closes: [{ id, take, pnl, remaining }], realized } as decimal strings
 */
function closeLotsFifo(lots, quantity, proceedsUnit) {
    let left = toUnits(quantity);
    const unit = toUnits(proceedsUnit);
    const closes = [];
    let realized = 0n;
    for (const lot of lots) {
        if (left <= 0n) break;
        const open = toUnits(lot.quantityOpen);
        if (open <= 0n) continue;
        const take = open < left ? open : left;
        const pnl = mul(take, unit - toUnits(lot.unitCost));
        realized += pnl;
        left -= take;
        closes.push({ id: lot.id, take: fromUnits(take), pnl: fromUnits(pnl), remaining: fromUnits(open - take) });
    }
    if (left > 0n) throw new RangeError('Not enough open quantity');
    return { closes, realized: fromUnits(realized) };
}

/**
 * Mirror portfolio update: the same cash flow invested in (buy) or taken out of (sell)
 * the benchmark at its current price. Returns the new state; prices in base currency.
 */
function mirrorStep({ units, cash }, { side, amount, benchmarkPrice }) {
    const u = toUnits(units);
    const c = toUnits(cash);
    const a = toUnits(amount);
    if (benchmarkPrice === null || benchmarkPrice === undefined || !(Number(benchmarkPrice) > 0)) {
        return { units: fromUnits(u), cash: fromUnits(c), complete: false };
    }
    const p = toUnits(benchmarkPrice);
    if (side === 'buy') {
        return { units: fromUnits(u + div(a, p)), cash: fromUnits(c - a), complete: true };
    }
    // Sell the benchmark worth the same proceeds (never below zero units).
    const sellUnits = div(a, p);
    const sold = sellUnits > u ? u : sellUnits;
    return { units: fromUnits(u - sold), cash: fromUnits(c + mul(sold, p)), complete: true };
}

/** Whole shares for stocks, 8 decimals for crypto, rounded down. */
function roundQuantity(qty, assetType) {
    if (assetType === 'stock') return Math.floor(qty + 1e-9);
    return Math.floor(qty * 1e8 + 1e-6) / 1e8;
}

module.exports = { closeLotsFifo, mirrorStep, roundQuantity };
