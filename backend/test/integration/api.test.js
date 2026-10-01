'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { setup, registerUser } = require('./helpers');
const { createApp } = require('../../src/app');
const { createLogger } = require('../../src/logger');

let ctx;

test.before(async () => {
    ctx = await setup();
});
test.after(async () => {
    if (ctx?.close) await ctx.close();
});

const skipIfNoDb = (t) => {
    if (ctx.skip) {
        t.skip(ctx.skip);
        return true;
    }
    return false;
};

test('health endpoints', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await a.get('/api/health').expect(200, { status: 'ok' });
    await a.get('/api/health/ready').expect(200, { status: 'ok', database: 'up' });
    const res = await a.get('/api/nope').expect(404);
    assert.match(res.body.error, /Route not found/);
});

test('auth: register, session cookie, me, logout', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    const res = await a.post('/api/auth/register').send({ username: 'auth_user', email: 'Auth@Example.com', password: 'longenough1' }).expect(201);
    assert.equal(res.body.user.email, 'auth@example.com');
    assert.equal(res.body.user.password_hash, undefined);
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /qt_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);

    const me = await a.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.username, 'auth_user');

    await a.post('/api/auth/logout').expect(204);
    await a.get('/api/auth/me').expect(401);
});

test('auth: validation, duplicates and bad credentials', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    const bad = await a.post('/api/auth/register').send({ username: 'x', email: 'not-an-email', password: 'short' }).expect(400);
    assert.deepEqual(bad.body.details.map((d) => d.field).sort(), ['email', 'password', 'username']);

    await registerUser(a, 'dupe');
    const dup = await ctx.agent().post('/api/auth/register').send({ username: 'other', email: 'dupe@example.com', password: 'longenough1' }).expect(409);
    assert.match(dup.body.error, /already registered/);

    await ctx.agent().post('/api/auth/login').send({ email: 'dupe@example.com', password: 'wrong-password' }).expect(401);
    await ctx.agent().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' }).expect(401);
    await ctx.agent().post('/api/auth/login').send({ email: 'DUPE@example.com', password: 'correct horse battery' }).expect(200);
});

test('auth: state-changing requests require the CSRF header', async (t) => {
    if (skipIfNoDb(t)) return;
    const res = await supertest(ctx.app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' }).expect(403);
    assert.match(res.body.error, /X-Requested-With/);
});

test('auth: malformed JSON is a 400', async (t) => {
    if (skipIfNoDb(t)) return;
    await ctx.agent().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400);
});

test('auth: changing password revokes other sessions', async (t) => {
    if (skipIfNoDb(t)) return;
    const first = ctx.agent();
    await registerUser(first, 'pw_user');
    const second = ctx.agent();
    await second.post('/api/auth/login').send({ email: 'pw_user@example.com', password: 'correct horse battery' }).expect(200);

    await first.post('/api/auth/password').send({ currentPassword: 'wrong', newPassword: 'new password 1' }).expect(401);
    await first.post('/api/auth/password').send({ currentPassword: 'correct horse battery', newPassword: 'new password 1' }).expect(200);
    await first.get('/api/auth/me').expect(200);
    await second.get('/api/auth/me').expect(401);
    await ctx.agent().post('/api/auth/login').send({ email: 'pw_user@example.com', password: 'new password 1' }).expect(200);
});

test('auth: logout-all and account deletion', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'gone');
    const b = ctx.agent();
    await b.post('/api/auth/login').send({ email: 'gone@example.com', password: 'correct horse battery' }).expect(200);
    await a.post('/api/auth/logout-all').expect(204);
    await b.get('/api/auth/me').expect(401);

    await b.post('/api/auth/login').send({ email: 'gone@example.com', password: 'correct horse battery' }).expect(200);
    await b.post('/api/watchlist').send({ assetType: 'stock', symbol: 'AAPL' }).expect(201);
    await b.delete('/api/auth/me').send({ password: 'nope' }).expect(401);
    await b.delete('/api/auth/me').send({ password: 'correct horse battery' }).expect(204);
    await b.get('/api/auth/me').expect(401);
    const [rows] = await ctx.db.query("SELECT COUNT(*) AS n FROM watchlist_items w JOIN users u ON u.id = w.user_id WHERE u.username = 'gone'");
    assert.equal(Number(rows[0].n), 0);
});

test('protected routes reject anonymous and forged tokens', async (t) => {
    if (skipIfNoDb(t)) return;
    await ctx.agent().get('/api/portfolio').expect(401);
    await ctx.agent().get('/api/market/quote/stock/AAPL').expect(401);
    await ctx.agent().get('/api/watchlist').set('Authorization', 'Bearer not.a.jwt').expect(401);
});

test('watchlist: add, list with quotes, duplicates, unknown symbols, isolation, remove', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'watcher');

    await a.post('/api/watchlist').send({ assetType: 'stock', symbol: 'aapl' }).expect(201);
    await a.post('/api/watchlist').send({ assetType: 'crypto', symbol: 'BTC' }).expect(201);
    await a.post('/api/watchlist').send({ assetType: 'stock', symbol: 'AAPL' }).expect(409);
    await a.post('/api/watchlist').send({ assetType: 'stock', symbol: 'ZZZZ' }).expect(404);
    await a.post('/api/watchlist').send({ assetType: 'crypto', symbol: 'BT-C' }).expect(400);

    const list = await a.get('/api/watchlist').expect(200);
    assert.deepEqual(list.body.items.map((i) => [i.assetType, i.symbol, i.quote.price]), [['stock', 'AAPL', 200], ['crypto', 'BTC', 60000]]);

    const other = ctx.agent();
    await registerUser(other, 'watcher2');
    const otherList = await other.get('/api/watchlist').expect(200);
    assert.equal(otherList.body.items.length, 0);
    await other.delete('/api/watchlist/stock/AAPL').expect(404);

    await a.delete('/api/watchlist/stock/AAPL').expect(204);
    const after = await a.get('/api/watchlist?quotes=false').expect(200);
    assert.deepEqual(after.body.items.map((i) => i.symbol), ['BTC']);
});

test('portfolio: transactions build holdings with realized and unrealized P&L', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'investor');

    const buy = (body) => a.post('/api/portfolio/transactions').send({ assetType: 'stock', symbol: 'AAPL', side: 'buy', ...body });
    await buy({ quantity: '10', price: '150', fee: '1', executedAt: '2024-01-02T15:00:00Z' }).expect(201);
    await buy({ quantity: 10, price: 170, executedAt: '2024-02-01T15:00:00Z' }).expect(201);
    const sell = await a
        .post('/api/portfolio/transactions')
        .send({ assetType: 'stock', symbol: 'AAPL', side: 'sell', quantity: '5', price: '180', fee: '0.5', executedAt: '2024-03-01T15:00:00Z' })
        .expect(201);
    // avg = (1500 + 1 + 1700) / 20 = 160.05 -> realized = 5 * (180 - 160.05) - 0.5 = 99.25
    assert.equal(sell.body.transaction.realizedPnl, '99.25000000');

    await a
        .post('/api/portfolio/transactions')
        .send({ assetType: 'crypto', symbol: 'ETH', side: 'buy', quantity: '0.12345678', price: '2500.5' })
        .expect(201);

    const { body } = await a.get('/api/portfolio').expect(200);
    const aapl = body.positions.find((p) => p.symbol === 'AAPL');
    assert.equal(aapl.quantity, '15.00000000');
    assert.equal(aapl.averageCost, '160.05000000');
    assert.equal(aapl.marketValue, 3000);
    assert.equal(aapl.unrealizedPnl, 599.25);
    assert.equal(aapl.realizedPnl, 99.25);
    const eth = body.positions.find((p) => p.symbol === 'ETH');
    assert.equal(eth.quantity, '0.12345678');
    const usd = body.totals.find((x) => x.currency === 'USD');
    assert.equal(usd.marketValue, Math.round((3000 + 0.12345678 * 3000) * 100) / 100);
});

test('portfolio: overselling is rejected, including via back-dated sells and deletes', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'careful');
    const post = (body) => a.post('/api/portfolio/transactions').send({ assetType: 'stock', symbol: 'MSFT', ...body });

    const firstBuy = await post({ side: 'buy', quantity: '5', price: '300', executedAt: '2024-01-10T00:00:00Z' }).expect(201);
    await post({ side: 'sell', quantity: '6', price: '310' }).expect(422);
    // A sell dated before the buy would have nothing to sell at that time.
    const early = await post({ side: 'sell', quantity: '1', price: '310', executedAt: '2024-01-01T00:00:00Z' }).expect(422);
    assert.match(early.body.error, /only 0\.00000000 held on 2024-01-01/);

    await post({ side: 'sell', quantity: '2', price: '320', executedAt: '2024-01-20T00:00:00Z' }).expect(201);
    // Deleting the buy would leave the sell uncovered.
    await a.delete(`/api/portfolio/transactions/${firstBuy.body.transaction.id}`).expect(422);

    const txs = await a.get('/api/portfolio/transactions?symbol=msft').expect(200);
    assert.equal(txs.body.total, 2);
    assert.equal(txs.body.transactions[0].side, 'sell');

    // Delete the sell, then the buy: the holding disappears entirely.
    await a.delete(`/api/portfolio/transactions/${txs.body.transactions[0].id}`).expect(204);
    await a.delete(`/api/portfolio/transactions/${firstBuy.body.transaction.id}`).expect(204);
    const { body } = await a.get('/api/portfolio').expect(200);
    assert.equal(body.positions.length, 0);
});

test('portfolio: validation, currency consistency and isolation', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'validator');
    const post = (body) => a.post('/api/portfolio/transactions').send({ assetType: 'stock', symbol: 'AAPL', side: 'buy', quantity: '1', price: '1', ...body });

    await post({ quantity: '-1' }).expect(400);
    await post({ quantity: '0' }).expect(400);
    await post({ price: '1.123456789' }).expect(400);
    await post({ side: 'hold' }).expect(400);
    await post({ executedAt: '2999-01-01T00:00:00Z' }).expect(422);
    await post({ currency: 'usd' }).expect(201);
    const mismatch = await post({ currency: 'EUR' }).expect(422);
    assert.match(mismatch.body.error, /already recorded in USD/);

    const other = ctx.agent();
    await registerUser(other, 'validator2');
    const mine = await a.get('/api/portfolio/transactions').expect(200);
    await other.delete(`/api/portfolio/transactions/${mine.body.transactions[0].id}`).expect(404);
    const theirs = await other.get('/api/portfolio').expect(200);
    assert.equal(theirs.body.positions.length, 0);
});

test('portfolio: concurrent sells cannot oversell', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'racer');
    await a.post('/api/portfolio/transactions').send({ assetType: 'crypto', symbol: 'BTC', side: 'buy', quantity: '1', price: '50000' }).expect(201);
    const sells = await Promise.all(
        Array.from({ length: 5 }, () =>
            a.post('/api/portfolio/transactions').send({ assetType: 'crypto', symbol: 'BTC', side: 'sell', quantity: '0.4', price: '60000' })
        )
    );
    assert.equal(sells.filter((r) => r.status === 201).length, 2);
    assert.equal(sells.filter((r) => r.status === 422).length, 3);
    const { body } = await a.get('/api/portfolio').expect(200);
    assert.equal(body.positions[0].quantity, '0.20000000');
});

test('alerts: create, check against live prices, re-arm, delete', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'alerter');

    await a.post('/api/alerts').send({ assetType: 'stock', symbol: 'AAPL', condition: 'price_above', targetValue: '-5' }).expect(400);
    await a.post('/api/alerts').send({ assetType: 'stock', symbol: 'NOPE', condition: 'price_above', targetValue: '5' }).expect(404);
    const above = await a.post('/api/alerts').send({ assetType: 'stock', symbol: 'AAPL', condition: 'price_above', targetValue: '210' }).expect(201);
    await a.post('/api/alerts').send({ assetType: 'crypto', symbol: 'ETH', condition: 'change_pct_below', targetValue: '-2.5' }).expect(201);

    let check = await a.post('/api/alerts/check').expect(200);
    assert.equal(check.body.checked, 2);
    assert.equal(check.body.triggered, 1); // ETH is down 3%
    const eth = check.body.alerts.find((x) => x.symbol === 'ETH');
    assert.equal(eth.isActive, false);
    assert.equal(Number(eth.triggeredValue), -3);

    ctx.market.prices.stock.AAPL.price = 215;
    check = await a.post('/api/alerts/check').expect(200);
    assert.equal(check.body.triggered, 1);
    ctx.market.prices.stock.AAPL.price = 200;

    const rearmed = await a.patch(`/api/alerts/${above.body.alert.id}`).send({ isActive: true, targetValue: '250' }).expect(200);
    assert.equal(rearmed.body.alert.isActive, true);
    assert.equal(rearmed.body.alert.triggeredAt, null);
    assert.equal(rearmed.body.alert.targetValue, '250.00000000');

    const other = ctx.agent();
    await registerUser(other, 'alerter2');
    await other.patch(`/api/alerts/${above.body.alert.id}`).send({ isActive: false }).expect(404);
    await other.delete(`/api/alerts/${above.body.alert.id}`).expect(404);

    await a.delete(`/api/alerts/${above.body.alert.id}`).expect(204);
    const list = await a.get('/api/alerts').expect(200);
    assert.equal(list.body.alerts.length, 1);
});

test('market: quotes, search and technical analysis', async (t) => {
    if (skipIfNoDb(t)) return;
    const a = ctx.agent();
    await registerUser(a, 'analyst');
    const q = await a.get('/api/market/quote/crypto/btc').expect(200);
    assert.equal(q.body.quote.price, 60000);
    await a.get('/api/market/quote/stock/NOPE').expect(404);
    await a.get('/api/market/quote/bond/X').expect(400);
    const s = await a.get('/api/market/search?assetType=stock&q=aa').expect(200);
    assert.deepEqual(s.body.results.map((r) => r.symbol), ['AAPL']);
    const analysis = await a.get('/api/market/analysis/stock/AAPL').expect(200);
    assert.equal(analysis.body.series.length, 60);
    assert.ok(analysis.body.summary.signals.length >= 3);
    assert.match(analysis.body.disclaimer, /Not investment advice/);
    await a.get('/api/market/crypto/top?limit=500').expect(400);
});

test('auth endpoints are rate limited', async (t) => {
    if (skipIfNoDb(t)) return;
    const env = { ...ctx.env, RATE_LIMIT_IN_TEST: true };
    const app = createApp({ env, db: ctx.db, market: ctx.market, logger: createLogger(env) });
    const statuses = [];
    for (let i = 0; i < 22; i++) {
        const res = await supertest(app)
            .post('/api/auth/login')
            .set('X-Requested-With', 'XMLHttpRequest')
            .send({ email: 'nobody@example.com', password: 'whatever1' });
        statuses.push(res.status);
    }
    assert.equal(statuses.filter((s) => s === 401).length, 20);
    assert.equal(statuses.at(-1), 429);
});
