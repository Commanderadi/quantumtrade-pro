'use strict';

const { withTransaction } = require('../../db/pool');
const { lockUser } = require('../portfolio');
const { toUnits, fromUnits, mul, div } = require('../../utils/money');
const { unprocessable } = require('../../utils/httpError');
const { closeLotsFifo, mirrorStep, roundQuantity } = require('./ledger');

const BENCHMARK_LABELS = { 'NIFTYBEES.NSE': 'Nifty 50', 'NIFTYBEES.BSE': 'Nifty 50', SPY: 'S&P 500' };
const dec = (n) => (Number.isFinite(n) ? n.toFixed(8) : '0');
const num = (s) => (s === null || s === undefined ? null : Number(s));

/**
 * Practice ("paper") trading. Orders fill at the latest quote with an approximate cost,
 * every buy is journalled with a reason, and a mirror account invests the same cash flows
 * in a benchmark index so users can see whether their decisions beat simply buying the index.
 */
function createCoach({ env, db, market }) {
    const feeRate = env.COACH_FEE_BPS / 1e4;
    const benchmarkFor = (currency) => (currency === 'INR' ? env.COACH_BENCHMARK_INR : env.COACH_BENCHMARK_USD);

    async function ensureAccount(executor, userId, currency = env.COACH_CURRENCY) {
        const [[row]] = await executor.execute('SELECT * FROM paper_accounts WHERE user_id = ?', [userId]);
        if (row) return row;
        const cash = dec(env.COACH_STARTING_CASH);
        await executor.execute(
            `INSERT IGNORE INTO paper_accounts (user_id, base_currency, starting_cash, cash, benchmark_symbol, mirror_units, mirror_cash)
             VALUES (?, ?, ?, ?, ?, 0, ?)`,
            [userId, currency, cash, cash, benchmarkFor(currency), cash]
        );
        const [[created]] = await executor.execute('SELECT * FROM paper_accounts WHERE user_id = ?', [userId]);
        return created;
    }

    /** Latest price of an asset converted into the account currency. */
    async function priceInBase(assetType, symbol, base) {
        const quote = await market.getQuote(assetType, symbol);
        const fx = await market.fxRate(quote.currency, base);
        return { quote, fx, priceBase: quote.price * fx };
    }

    async function benchmarkPrice(account) {
        try {
            const { priceBase, quote } = await priceInBase('stock', account.benchmark_symbol, account.base_currency);
            return { price: priceBase, symbol: quote.symbol ?? account.benchmark_symbol };
        } catch {
            return { price: null, symbol: account.benchmark_symbol };
        }
    }

    async function placeOrder(userId, order) {
        const account0 = await ensureAccount(db, userId);
        const base = account0.base_currency;
        // Prices are fetched before the database transaction so no lock is held during network calls.
        const { quote, fx, priceBase } = await priceInBase(order.assetType, order.symbol, base);
        const bench = await benchmarkPrice(account0);
        const symbol = quote.symbol ?? order.symbol;

        return withTransaction(db, async (conn) => {
            await lockUser(conn, userId);
            const [[account]] = await conn.execute('SELECT * FROM paper_accounts WHERE user_id = ? FOR UPDATE', [userId]);
            const [lots] = await conn.execute(
                `SELECT id, quantity_open, unit_cost FROM paper_lots
                  WHERE user_id = ? AND asset_type = ? AND symbol = ? AND quantity_open > 0
                  ORDER BY opened_at, id FOR UPDATE`,
                [userId, order.assetType, symbol]
            );
            const held = lots.reduce((s, l) => s + Number(l.quantity_open), 0);
            const now = new Date();

            let quantity;
            if (order.side === 'buy') {
                quantity = order.quantity !== undefined
                    ? Number(order.quantity)
                    : roundQuantity(order.amount / (priceBase * (1 + feeRate)), order.assetType);
            } else {
                quantity = order.all ? held : Number(order.quantity);
            }
            if (order.assetType === 'stock' && !Number.isInteger(quantity)) throw unprocessable('Stocks trade in whole shares.');
            if (!(quantity > 0)) {
                throw unprocessable(order.side === 'buy' ? `That amount buys less than one ${order.assetType === 'stock' ? 'share' : 'unit'} at the current price.` : `You have no ${symbol} to sell.`);
            }

            const qtyUnits = toUnits(dec(quantity));
            const gross = mul(qtyUnits, toUnits(dec(priceBase)));
            const fee = mul(gross, toUnits(dec(feeRate)));
            const cash = toUnits(account.cash);
            let cashAfter;
            let realized = null;

            if (order.side === 'buy') {
                const total = gross + fee;
                if (total > cash) throw unprocessable(`Not enough practice cash: this order costs ${fromUnits(total)} and you have ${account.cash}.`);
                cashAfter = cash - total;
            } else {
                if (quantity > held + 1e-9) throw unprocessable(`You only hold ${held} ${symbol}.`);
                cashAfter = cash + gross - fee;
            }

            const [ins] = await conn.execute(
                `INSERT INTO paper_trades (user_id, symbol, asset_type, side, quantity, price, price_currency, fx_rate, gross_amount, fee,
                                           cash_after, reason, confidence, note, day_change_pct, benchmark_price, executed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, symbol, order.assetType, order.side, fromUnits(qtyUnits), dec(quote.price), quote.currency, dec(fx), fromUnits(gross), fromUnits(fee),
                    fromUnits(cashAfter), order.reason, order.confidence ?? null, order.note ?? null,
                    quote.changePercent === null || quote.changePercent === undefined ? null : quote.changePercent.toFixed(4),
                    bench.price === null ? null : dec(bench.price), now]
            );

            if (order.side === 'buy') {
                await conn.execute(
                    `INSERT INTO paper_lots (user_id, buy_trade_id, symbol, asset_type, quantity, quantity_open, unit_cost, reason, opened_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, ins.insertId, symbol, order.assetType, fromUnits(qtyUnits), fromUnits(qtyUnits), fromUnits(div(gross + fee, qtyUnits)), order.reason, now]
                );
            } else {
                const proceedsUnit = fromUnits(div(gross - fee, qtyUnits));
                const result = closeLotsFifo(lots.map((l) => ({ id: l.id, quantityOpen: l.quantity_open, unitCost: l.unit_cost })), fromUnits(qtyUnits), proceedsUnit);
                for (const c of result.closes) {
                    await conn.execute(
                        `UPDATE paper_lots SET quantity_open = ?, realized_pnl = realized_pnl + ?, closed_at = ? WHERE id = ?`,
                        [c.remaining, c.pnl, now, c.id]
                    );
                }
                realized = result.realized;
                await conn.execute('UPDATE paper_trades SET realized_pnl = ? WHERE id = ?', [realized, ins.insertId]);
            }

            const flow = order.side === 'buy' ? gross + fee : gross - fee;
            const mirror = mirrorStep(
                { units: account.mirror_units, cash: account.mirror_cash },
                { side: order.side, amount: fromUnits(flow), benchmarkPrice: bench.price === null ? null : dec(bench.price) }
            );
            await conn.execute(
                'UPDATE paper_accounts SET cash = ?, mirror_units = ?, mirror_cash = ?, mirror_complete = mirror_complete AND ? WHERE user_id = ?',
                [fromUnits(cashAfter), mirror.units, mirror.cash, mirror.complete ? 1 : 0, userId]
            );

            return {
                trade: {
                    id: Number(ins.insertId), symbol, requestedSymbol: order.symbol, assetType: order.assetType, side: order.side,
                    quantity: fromUnits(qtyUnits), price: quote.price, priceCurrency: quote.currency, fxRate: fx,
                    grossAmount: fromUnits(gross), fee: fromUnits(fee), realizedPnl: realized, cashAfter: fromUnits(cashAfter),
                    reason: order.reason, note: order.note ?? null, executedAt: now.toISOString(),
                },
                note: quote.note ?? null,
                priceAsOf: quote.asOf,
            };
        });
    }

    async function loadLots(userId) {
        const [rows] = await db.execute('SELECT * FROM paper_lots WHERE user_id = ? ORDER BY opened_at, id', [userId]);
        return rows.map((l) => ({
            id: Number(l.id), symbol: l.symbol, assetType: l.asset_type, quantity: l.quantity, quantityOpen: l.quantity_open,
            unitCost: l.unit_cost, reason: l.reason, openedAt: l.opened_at, closedAt: l.closed_at, realizedPnl: l.realized_pnl,
        }));
    }

    async function loadTrades(userId, limit = 1000) {
        const [rows] = await db.query('SELECT * FROM paper_trades WHERE user_id = ? ORDER BY executed_at DESC, id DESC LIMIT ?', [userId, limit]);
        return rows.map((t) => ({
            id: Number(t.id), symbol: t.symbol, assetType: t.asset_type, side: t.side, quantity: t.quantity, price: t.price,
            priceCurrency: t.price_currency, fxRate: t.fx_rate, grossAmount: t.gross_amount, fee: t.fee, realizedPnl: t.realized_pnl,
            cashAfter: t.cash_after, reason: t.reason, confidence: t.confidence, note: t.note,
            dayChangePct: num(t.day_change_pct), benchmarkPrice: t.benchmark_price, executedAt: t.executed_at,
        }));
    }

    /** Values the account at current prices, including the benchmark mirror. */
    async function summary(userId) {
        const account = await ensureAccount(db, userId);
        const base = account.base_currency;
        const lots = await loadLots(userId);
        const open = new Map();
        for (const l of lots) {
            if (!(Number(l.quantityOpen) > 0)) continue;
            const key = `${l.assetType}:${l.symbol}`;
            const p = open.get(key) ?? { symbol: l.symbol, assetType: l.assetType, quantity: 0, cost: 0 };
            p.quantity += Number(l.quantityOpen);
            p.cost += Number(l.quantityOpen) * Number(l.unitCost);
            open.set(key, p);
        }

        const fxCache = new Map();
        const fxTo = async (cur) => {
            if (!fxCache.has(cur)) fxCache.set(cur, await market.fxRate(cur, base).catch(() => null));
            return fxCache.get(cur);
        };
        const positions = [];
        const priceBySymbol = new Map();
        for (const type of ['stock', 'crypto']) {
            const list = [...open.values()].filter((p) => p.assetType === type);
            if (!list.length) continue;
            const { quotes, errors } = await market.getQuotes(type, list.map((p) => p.symbol));
            for (const p of list) {
                const q = quotes.get(p.symbol);
                const rate = q ? await fxTo(q.currency) : null;
                const priceBase = q && rate !== null ? q.price * rate : null;
                if (priceBase !== null) priceBySymbol.set(`${type}:${p.symbol}`, priceBase);
                const value = priceBase === null ? null : p.quantity * priceBase;
                positions.push({
                    symbol: p.symbol, assetType: type, quantity: p.quantity, avgCost: p.cost / p.quantity, cost: p.cost,
                    price: q?.price ?? null, priceCurrency: q?.currency ?? null, priceBase, value,
                    pnl: value === null ? null : value - p.cost, pnlPct: value === null || p.cost === 0 ? null : value / p.cost - 1,
                    dayChangePct: q?.changePercent ?? null, quoteError: q ? null : errors.get(p.symbol) ?? 'Price unavailable',
                });
            }
        }

        const cash = Number(account.cash);
        const invested = positions.reduce((s, p) => s + (p.value ?? p.cost), 0);
        const totalValue = cash + invested;
        for (const p of positions) p.weight = totalValue > 0 && p.value !== null ? p.value / totalValue : null;
        const starting = Number(account.starting_cash);
        const realizedPnl = lots.reduce((s, l) => s + Number(l.realizedPnl), 0);
        const unrealizedPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0);

        const bench = await benchmarkPrice(account);
        const mirrorValue = bench.price === null ? null : Number(account.mirror_cash) + Number(account.mirror_units) * bench.price;
        const [[{ trades, fees }]] = await db.execute('SELECT COUNT(*) AS trades, COALESCE(SUM(fee), 0) AS fees FROM paper_trades WHERE user_id = ?', [userId]);

        return {
            account: {
                currency: base, startingCash: starting, cash, investedValue: invested, totalValue,
                totalReturn: totalValue - starting, totalReturnPct: totalValue / starting - 1,
                realizedPnl, unrealizedPnl, feesPaid: Number(fees), tradeCount: Number(trades), feeBps: env.COACH_FEE_BPS,
                createdAt: account.created_at,
            },
            mirror: {
                symbol: account.benchmark_symbol,
                label: BENCHMARK_LABELS[account.benchmark_symbol] ?? account.benchmark_symbol,
                value: mirrorValue,
                returnPct: mirrorValue === null ? null : mirrorValue / starting - 1,
                complete: Boolean(account.mirror_complete),
                available: bench.price !== null,
            },
            positions: positions.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
            priceBySymbol,
            lots,
        };
    }

    async function reset(userId, { currency }) {
        await withTransaction(db, async (conn) => {
            await lockUser(conn, userId);
            await conn.execute('DELETE FROM paper_trades WHERE user_id = ?', [userId]); // lots cascade
            await conn.execute('DELETE FROM paper_accounts WHERE user_id = ?', [userId]);
            await ensureAccount(conn, userId, currency ?? env.COACH_CURRENCY);
        });
    }

    return { placeOrder, summary, loadTrades, loadLots, reset, ensureAccount };
}

module.exports = { createCoach, BENCHMARK_LABELS };
