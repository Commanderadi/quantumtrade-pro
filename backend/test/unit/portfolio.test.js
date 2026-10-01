'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { replayPosition, valuePortfolio } = require('../../src/services/portfolio');

const tx = (id, side, quantity, price, fee = '0', date = `2024-01-0${id}`) => ({
    id, symbol: 'AAPL', side, quantity, price, fee, executed_at: new Date(date),
});

test('average cost includes buy fees', () => {
    const p = replayPosition([tx(1, 'buy', '10', '100', '5'), tx(2, 'buy', '10', '110', '5')]);
    assert.equal(p.quantity, '20.00000000');
    assert.equal(p.averageCost, '105.50000000'); // (1000 + 5 + 1100 + 5) / 20
    assert.equal(p.realizedPnl, '0.00000000');
});

test('sells realize P&L against average cost minus fees', () => {
    const p = replayPosition([tx(1, 'buy', '10', '100'), tx(2, 'sell', '4', '150', '2')]);
    assert.equal(p.quantity, '6.00000000');
    assert.equal(p.averageCost, '100.00000000');
    assert.equal(p.realizedPnl, '198.00000000'); // 4 * 50 - 2
    assert.equal(p.realizedByTx.get(2), '198.00000000');
});

test('closing a position resets average cost', () => {
    const p = replayPosition([tx(1, 'buy', '1', '100'), tx(2, 'sell', '1', '90'), tx(3, 'buy', '2', '50')]);
    assert.equal(p.averageCost, '50.00000000');
    assert.equal(p.realizedPnl, '-10.00000000');
    assert.equal(p.isOpen, true);
});

test('handles tiny crypto quantities and prices exactly', () => {
    const p = replayPosition([tx(1, 'buy', '1000000', '0.00001234'), tx(2, 'buy', '0.5', '0.00001235')]);
    assert.equal(p.quantity, '1000000.50000000');
    assert.equal(p.averageCost, '0.00001234');
});

test('rejects overselling', () => {
    assert.throws(
        () => replayPosition([tx(1, 'buy', '1', '100'), tx(2, 'sell', '2', '100')]),
        (err) => err.status === 422 && /only 1\.00000000 held/.test(err.message)
    );
});

test('valuePortfolio values positions per currency and flags missing quotes', async () => {
    const holdings = [
        { symbol: 'AAPL', asset_type: 'stock', quantity: '10', average_cost: '100', currency: 'USD', realized_pnl: '5' },
        { symbol: 'MSFT', asset_type: 'stock', quantity: '1', average_cost: '300', currency: 'USD', realized_pnl: '0' },
        { symbol: 'RELIANCE.BSE', asset_type: 'stock', quantity: '2', average_cost: '2500', currency: 'INR', realized_pnl: '0' },
        { symbol: 'BTC', asset_type: 'crypto', quantity: '0.5', average_cost: '40000', currency: 'USD', realized_pnl: '0' },
        { symbol: 'ETH', asset_type: 'crypto', quantity: '0', average_cost: '0', currency: 'USD', realized_pnl: '-20' },
    ];
    const market = {
        async getQuotes(type, symbols) {
            const prices = { AAPL: { price: 120, change: 2 }, 'RELIANCE.BSE': { price: 2600, change: -10 }, BTC: { price: 50000, change: 1000 } };
            const quotes = new Map();
            const errors = new Map();
            for (const s of symbols) {
                if (prices[s]) quotes.set(s, { ...prices[s], changePercent: 1, asOf: 'now' });
                else errors.set(s, 'rate limited');
            }
            assert.ok(!symbols.includes('ETH'), 'closed positions are not quoted');
            return { quotes, errors };
        },
    };
    const { positions, totals } = await valuePortfolio(holdings, market);
    const usd = totals.find((t) => t.currency === 'USD');
    const inr = totals.find((t) => t.currency === 'INR');
    assert.equal(usd.marketValue, 1200 + 25000);
    assert.equal(usd.costBasis, 1000 + 20000);
    assert.equal(usd.unrealizedPnl, 5200);
    assert.equal(usd.realizedPnl, -15);
    assert.equal(usd.unpricedPositions, 1);
    assert.equal(usd.dayChange, 20 + 500);
    assert.equal(inr.marketValue, 5200);
    const msft = positions.find((p) => p.symbol === 'MSFT');
    assert.equal(msft.marketValue, null);
    assert.equal(msft.quoteError, 'rate limited');
    const aapl = positions.find((p) => p.symbol === 'AAPL');
    assert.equal(aapl.unrealizedPnlPercent, 20);
    assert.equal(aapl.allocationPercent, Math.round((1200 / 26200) * 10000) / 100);
});
