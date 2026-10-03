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

const buy = (agent, assetType, symbol, quantity, price) =>
    agent.post('/api/portfolio/transactions').send({ assetType, symbol, side: 'buy', quantity: String(quantity), price: String(price) }).expect(201);

test('quant endpoints require a session', async (t) => {
    if (skip(t)) return;
    await ctx.agent().get('/api/quant/strategies').expect(401);
    await ctx.agent().post('/api/quant/backtest').send({}).expect(401);
});

test('strategies are listed with their parameters', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'quant_list');
    const { body } = await a.get('/api/quant/strategies').expect(200);
    const ids = body.strategies.map((s) => s.id);
    for (const id of ['buy_hold', 'sma_cross', 'donchian_breakout', 'momentum', 'macd_trend', 'rsi_reversion', 'bollinger_reversion', 'trend_vol_target']) assert.ok(ids.includes(id), id);
    assert.deepEqual(body.strategies.find((s) => s.id === 'sma_cross').params.map((p) => p.key), ['fast', 'slow']);
    assert.ok(body.optimizers.some((o) => o.id === 'risk_parity'));
});

test('backtest: evaluate, optimise and walk-forward modes', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'quant_bt');

    const ev = await a.post('/api/quant/backtest').send({ assetType: 'stock', symbol: 'aapl', strategy: 'sma_cross', params: { fast: 10, slow: 40 } }).expect(200);
    assert.equal(ev.body.symbol, 'AAPL');
    assert.equal(ev.body.mode, 'evaluate');
    assert.deepEqual(ev.body.params, { fast: 10, slow: 40 });
    assert.deepEqual(ev.body.costs, { commissionBps: 5, slippageBps: 5 });
    assert.ok(ev.body.inSample.metrics.bars > ev.body.outOfSample.metrics.bars);
    assert.ok(['no_edge', 'inconclusive', 'promising'].includes(ev.body.verdict.rating));
    assert.ok(ev.body.series.length > 100);
    assert.match(ev.body.disclaimer, /not investment advice/);

    const crypto = await a.post('/api/quant/backtest').send({ assetType: 'crypto', symbol: 'BTC', strategy: 'trend_vol_target' }).expect(200);
    assert.deepEqual(crypto.body.costs, { commissionBps: 10, slippageBps: 10 });

    const opt = await a.post('/api/quant/backtest').send({ assetType: 'stock', symbol: 'MSFT', strategy: 'donchian_breakout', mode: 'optimize' }).expect(200);
    assert.ok(opt.body.optimization.trials > 5);
    assert.ok(opt.body.optimization.luckSharpe > 0);

    const wf = await a.post('/api/quant/backtest').send({ assetType: 'stock', symbol: 'AAPL', strategy: 'momentum', mode: 'walk_forward', trainBars: 250, testBars: 80 }).expect(200);
    assert.equal(wf.body.windows.folds, 4);
    assert.ok(wf.body.folds.every((f) => f.params.lookback));
});

test('backtest: validation and data errors', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'quant_bad');
    const post = (body) => a.post('/api/quant/backtest').send({ assetType: 'stock', symbol: 'AAPL', strategy: 'sma_cross', ...body });
    await post({ strategy: 'magic' }).expect(400);
    const order = await post({ params: { fast: 60, slow: 50 } }).expect(400);
    assert.match(order.body.error, /shorter/);
    await post({ params: { fast: 'ten' } }).expect(400);
    await post({ split: 0.99 }).expect(400);
    await post({ commissionBps: -1 }).expect(400);
    const short = await post({ symbol: 'SHORT' }).expect(400);
    assert.match(short.body.error, /at least 150/);
    await post({ symbol: 'NOPE' }).expect(404);
});

test('risk: portfolio risk report with currency conversion and a benchmark', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'quant_risk');
    const empty = await a.get('/api/quant/risk').expect(422);
    assert.match(empty.body.error, /open position/);

    await buy(a, 'stock', 'AAPL', 10, 150);
    await buy(a, 'stock', 'MSFT', 5, 300);
    await buy(a, 'crypto', 'BTC', 0.05, 50000);

    const { body } = await a.get('/api/quant/risk?currency=INR&benchmark=SPY').expect(200);
    assert.equal(body.currency, 'INR');
    assert.equal(body.benchmark, 'SPY');
    // AAPL 2000 + MSFT 2000 + BTC 3000 = 7000 USD, at 80 INR per USD.
    assert.equal(Math.round(body.totalValue), 7000 * 80);
    const weights = Object.fromEntries(body.assets.map((x) => [x.symbol, x.weight]));
    assert.ok(Math.abs(weights.BTC - 3 / 7) < 1e-9);
    assert.ok(Math.abs(body.assets.reduce((s, x) => s + x.riskShare, 0) - 1) < 1e-9);
    assert.ok(body.annualVol > 0 && body.var95 > 0 && body.cvar95 >= body.var95);
    assert.equal(typeof body.beta, 'number');
    assert.equal(body.correlation.matrix.length, 3);
    assert.equal(body.skipped.length, 0);
    await a.get('/api/quant/risk?currency=rupees').expect(400);
});

test('optimize: suggested weights and rebalancing amounts', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'quant_opt');
    await buy(a, 'stock', 'AAPL', 10, 150);
    const one = await a.get('/api/quant/optimize').expect(422);
    assert.match(one.body.error, /at least two assets/);

    await buy(a, 'stock', 'MSFT', 5, 300);
    await buy(a, 'crypto', 'ETH', 1, 2500);
    for (const method of ['equal_weight', 'inverse_vol', 'risk_parity', 'min_variance', 'max_sharpe']) {
        const { body } = await a.get(`/api/quant/optimize?method=${method}&maxWeight=0.5`).expect(200);
        const total = body.assets.reduce((s, x) => s + x.targetWeight, 0);
        assert.ok(Math.abs(total - 1) < 1e-6, method);
        assert.ok(body.assets.every((x) => x.targetWeight <= 0.5 + 1e-6), method);
        // Rebalancing amounts net to zero: it is a reallocation of the same money.
        assert.ok(Math.abs(body.assets.reduce((s, x) => s + x.changeValue, 0)) < 1e-6, method);
        assert.ok(Math.abs(body.assets.reduce((s, x) => s + x.currentWeight, 0) - 1) < 1e-9);
    }
    await a.post('/api/watchlist').send({ assetType: 'crypto', symbol: 'BTC' }).expect(201);
    const withWatch = await a.get('/api/quant/optimize?include=watchlist').expect(200);
    const btc = withWatch.body.assets.find((x) => x.symbol === 'BTC');
    assert.equal(btc.inPortfolio, false);
    assert.equal(btc.currentWeight, 0);
    await a.get('/api/quant/optimize?method=magic').expect(400);
});

test('scan: ranks watchlist and holdings', async (t) => {
    if (skip(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'quant_scan');
    await a.get('/api/quant/scan').expect(422);
    await a.post('/api/watchlist').send({ assetType: 'stock', symbol: 'AAPL' }).expect(201);
    await a.post('/api/watchlist').send({ assetType: 'crypto', symbol: 'ETH' }).expect(201);
    await buy(a, 'stock', 'MSFT', 1, 300);
    const { body } = await a.get('/api/quant/scan').expect(200);
    assert.equal(body.assets.length, 3);
    assert.ok(body.assets[0].score >= body.assets.at(-1).score);
    const msft = body.assets.find((x) => x.symbol === 'MSFT');
    assert.equal(msft.held, true);
    assert.ok(msft.states.length >= 3);
    assert.match(body.note, /does not predict/);
});
