'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, registerUser } = require('./helpers');

let ctx;
test.before(async () => {
    ctx = await setup();
});
test.after(async () => {
    if (ctx?.close) await ctx.close();
});
const skip = (t) => (ctx.skip ? (t.skip(ctx.skip), true) : false);
const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(Number(a) - Number(b)) < eps, `${a} != ${b}`);
const order = (agent, body) => agent.post('/api/coach/orders').send({ assetType: 'stock', symbol: 'AAPL', side: 'buy', reason: 'research', ...body });

test('coach requires a session', async (t) => {
    if (skip(t)) return;
    await ctx.agent().get('/api/coach/account').expect(401);
});

test('practice account: buys, sells, fees, FIFO P&L and the Nifty mirror', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'coach_flow');

    const fresh = await a.get('/api/coach/account').expect(200);
    assert.equal(fresh.body.account.currency, 'INR');
    assert.equal(fresh.body.account.cash, 100000);
    assert.equal(fresh.body.mirror.value, 100000);
    assert.equal(fresh.body.mirror.label, 'Nifty 50');

    // ₹20,000 of AAPL at $200 x 80 = ₹16,000 per share -> 1 share, 0.1% fee.
    const buy = await order(a, { amount: 20000, note: 'Read the annual report', confidence: 4 }).expect(201);
    assert.equal(Number(buy.body.trade.quantity), 1);
    close(buy.body.trade.grossAmount, 16000);
    close(buy.body.trade.fee, 16);
    close(buy.body.trade.cashAfter, 83984);
    assert.equal(buy.body.trade.priceCurrency, 'USD');

    const tooBig = await order(a, { assetType: 'crypto', symbol: 'BTC', quantity: 0.1, reason: 'tip' }).expect(422);
    assert.match(tooBig.body.error, /Not enough practice cash/);
    await order(a, { assetType: 'crypto', symbol: 'BTC', quantity: 0.01, reason: 'tip' }).expect(201);

    const oversell = await order(a, { side: 'sell', quantity: 2, reason: 'take_profit' }).expect(422);
    assert.match(oversell.body.error, /only hold 1/);
    await order(a, { quantity: 1.5 }).expect(422); // whole shares only

    ctx.market.prices.stock.AAPL.price = 220;
    const sell = await order(a, { side: 'sell', all: true, reason: 'take_profit' }).expect(201);
    // Net proceeds 17,600 - 17.6 fee; cost basis 16,016 including the buy fee.
    close(sell.body.trade.realizedPnl, 17582.4 - 16016);
    ctx.market.prices.stock.AAPL.price = 200;

    const { body } = await a.get('/api/coach/account').expect(200);
    close(body.account.cash, 83984 - 48048 + 17582.4);
    assert.equal(body.positions.length, 1);
    assert.equal(body.positions[0].symbol, 'BTC');
    close(body.positions[0].value, 48000);
    close(body.account.totalValue, 83984 - 48048 + 17582.4 + 48000);
    close(body.account.feesPaid, 16 + 48 + 17.6); // 0.1% of 16,000 + 48,000 + 17,600
    assert.equal(body.account.tradeCount, 3);
    // The benchmark did not move, so the same cash flows in the index are still worth exactly ₹100,000.
    close(body.mirror.value, 100000, 1e-3);
    assert.equal(body.mirror.complete, true);

    const trades = await a.get('/api/coach/trades').expect(200);
    assert.deepEqual(trades.body.trades.map((x) => x.side), ['sell', 'buy', 'buy']);
    assert.equal(trades.body.trades[2].note, 'Read the annual report');
    assert.equal(trades.body.trades[2].confidence, 4);

    const insights = await a.get('/api/coach/insights').expect(200);
    const research = insights.body.reasons.find((r) => r.reason === 'research');
    assert.equal(research.winRate, 1);
    close(research.realizedPnl, 17582.4 - 16016);
    const tip = insights.body.reasons.find((r) => r.reason === 'tip');
    assert.equal(tip.closedLots, 0);
    assert.ok(tip.openPnl < 0); // the buy fee is the only change so far
    assert.ok(insights.body.behaviours.some((b) => b.id === 'concentration')); // BTC is nearly half the account
    assert.ok(insights.body.lessons.length >= 1);
});

test('validation of practice orders', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'coach_valid');
    await order(a, { reason: undefined, quantity: 1 }).expect(400);
    await order(a, { reason: 'because', quantity: 1 }).expect(400);
    await order(a, { quantity: 1, amount: 100 }).expect(400);
    await order(a, {}).expect(400);
    await order(a, { side: 'sell', amount: 100 }).expect(400);
    await order(a, { all: true }).expect(400);
    await order(a, { quantity: 0.123456789, assetType: 'crypto', symbol: 'BTC' }).expect(400);
    const tiny = await order(a, { amount: 100 }).expect(422);
    assert.match(tiny.body.error, /less than one share/);
    const nothing = await order(a, { side: 'sell', all: true, reason: 'stop_loss' }).expect(422);
    assert.match(nothing.body.error, /no AAPL to sell/);
    await order(a, { symbol: 'NOPE', quantity: 1 }).expect(404);
});

test('concurrent buys cannot overspend practice cash', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'coach_race');
    const results = await Promise.all([1, 2, 3].map(() => order(a, { quantity: 3 }))); // 3 x ₹48,048 > ₹100,000
    assert.equal(results.filter((r) => r.status === 201).length, 2);
    assert.equal(results.filter((r) => r.status === 422).length, 1);
    const { body } = await a.get('/api/coach/account').expect(200);
    assert.ok(body.account.cash >= 0);
    close(body.account.cash, 100000 - 2 * 48048);
});

test('reset needs confirmation, can switch currency and keeps users separate', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'coach_reset');
    await order(a, { quantity: 1 }).expect(201);
    const b = ctx.agent();
    await registerUser(b, 'coach_other');
    const other = await b.get('/api/coach/account').expect(200);
    assert.equal(other.body.account.tradeCount, 0);

    await a.post('/api/coach/reset').send({}).expect(400);
    const reset = await a.post('/api/coach/reset').send({ confirm: true, currency: 'USD' }).expect(200);
    assert.equal(reset.body.account.currency, 'USD');
    assert.equal(reset.body.account.cash, 100000);
    assert.equal(reset.body.account.tradeCount, 0);
    assert.equal(reset.body.mirror.symbol, 'SPY');
    const trades = await a.get('/api/coach/trades').expect(200);
    assert.equal(trades.body.trades.length, 0);

    const buyUsd = await order(a, { quantity: 1 }).expect(201);
    close(buyUsd.body.trade.grossAmount, 200); // USD account, USD stock: no conversion
});

test('lessons library is available', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'coach_lessons');
    const { body } = await a.get('/api/coach/lessons').expect(200);
    assert.ok(body.lessons.length >= 8);
    const insights = await a.get('/api/coach/insights').expect(200);
    assert.deepEqual(insights.body.lessons.map((l) => l.id), ['start_here']);
});
