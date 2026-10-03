'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { closeLotsFifo, mirrorStep, roundQuantity } = require('../../src/services/coach/ledger');
const { detectBehaviours, reasonScoreboard } = require('../../src/services/coach/insights');
const { LESSONS, getLesson } = require('../../src/services/coach/lessons');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(Number(a) - Number(b)) < eps, `${a} != ${b}`);

// ------------------------------------------------------------------ ledger

test('closeLotsFifo closes the oldest lots first and attributes P&L per lot', () => {
    const lots = [{ id: 1, quantityOpen: '5', unitCost: '100' }, { id: 2, quantityOpen: '5', unitCost: '120' }];
    const r = closeLotsFifo(lots, '7', '130');
    assert.deepEqual(r.closes.map((c) => [c.id, Number(c.take), Number(c.pnl), Number(c.remaining)]), [[1, 5, 150, 0], [2, 2, 20, 3]]);
    close(r.realized, 170);
});

test('closeLotsFifo refuses to sell more than is open and skips empty lots', () => {
    assert.throws(() => closeLotsFifo([{ id: 1, quantityOpen: '1', unitCost: '1' }], '2', '1'), RangeError);
    const r = closeLotsFifo([{ id: 1, quantityOpen: '0', unitCost: '1' }, { id: 2, quantityOpen: '1', unitCost: '2' }], '1', '1');
    assert.equal(r.closes.length, 1);
    close(r.realized, -1);
});

test('closeLotsFifo is exact with tiny crypto quantities', () => {
    const r = closeLotsFifo([{ id: 1, quantityOpen: '0.00012345', unitCost: '5000000' }], '0.00012345', '5100000');
    close(r.realized, 0.00012345 * 100000, 1e-8);
});

test('mirrorStep invests and withdraws the same cash flows in the benchmark', () => {
    let m = { units: '0', cash: '1000' };
    m = mirrorStep(m, { side: 'buy', amount: '400', benchmarkPrice: '200' });
    close(m.units, 2);
    close(m.cash, 600);
    m = mirrorStep(m, { side: 'sell', amount: '500', benchmarkPrice: '250' });
    close(m.units, 0);
    close(m.cash, 1100);
    assert.equal(m.complete, true);
});

test('mirrorStep never sells below zero units and flags missing prices', () => {
    const m = mirrorStep({ units: '1', cash: '0' }, { side: 'sell', amount: '1000', benchmarkPrice: '100' });
    close(m.units, 0);
    close(m.cash, 100);
    const missing = mirrorStep({ units: '1', cash: '5' }, { side: 'buy', amount: '3', benchmarkPrice: null });
    assert.equal(missing.complete, false);
    close(missing.cash, 5);
});

test('roundQuantity uses whole shares for stocks and 8 decimals for crypto', () => {
    assert.equal(roundQuantity(3.99, 'stock'), 3);
    assert.equal(roundQuantity(0.999, 'stock'), 0);
    assert.equal(roundQuantity(0.123456789, 'crypto'), 0.12345678);
});

// ---------------------------------------------------------------- insights

const t = (o) => ({ side: 'buy', symbol: 'AAA', reason: 'research', dayChangePct: 0, executedAt: '2024-01-01T10:00:00Z', fee: '1', ...o });
const base = { startingCash: 100000, totalValue: 100000, mirrorValue: 100000, mirrorComplete: true };
const ids = (r) => r.map((x) => x.id);

test('detects overtrading, chasing and tip-driven buying', () => {
    const trades = [
        ...Array.from({ length: 6 }, () => t({})),
        t({ dayChangePct: 6.5, symbol: 'HOT' }), t({ dayChangePct: 9, symbol: 'HOTTER', executedAt: '2024-01-02T10:00:00Z' }),
        t({ reason: 'tip' }), t({ reason: 'tip' }), t({ reason: 'tip' }),
    ];
    const r = detectBehaviours({ trades, lots: [], positions: [], account: base });
    assert.ok(ids(r).includes('overtrading'));
    assert.ok(ids(r).includes('chasing'));
    assert.ok(ids(r).includes('tips'));
    assert.match(r.find((x) => x.id === 'chasing').detail, /HOT, HOTTER/);
});

test('detects panic selling from down-day sells and quick losses', () => {
    const r = detectBehaviours({
        trades: [t({ side: 'sell', dayChangePct: -7 })],
        lots: [{ reason: 'gut', quantity: '10', quantityOpen: '0', unitCost: '100', openedAt: '2024-01-01', closedAt: '2024-01-05', realizedPnl: '-120' }],
        positions: [], account: base,
    });
    const panic = r.find((x) => x.id === 'panic_selling');
    assert.ok(panic);
    assert.match(panic.detail, /1 sell\(s\) on days/);
    assert.match(panic.detail, /1 position\(s\) sold at a loss/);
});

test('detects concentration and the disposition effect', () => {
    const lot = (pnl, open, closeDay) => ({ reason: 'research', quantity: '1', quantityOpen: '0', unitCost: '100', openedAt: `2024-01-${open}`, closedAt: `2024-01-${closeDay}`, realizedPnl: String(pnl) });
    const lots = [lot(10, '01', '02'), lot(12, '01', '03'), lot(8, '01', '02'), lot(-10, '01', '20'), lot(-5, '01', '25'), lot(-8, '01', '22')];
    const r = detectBehaviours({ trades: [], lots, positions: [{ symbol: 'BIG', value: 60000 }, { symbol: 'SMALL', value: 5000 }], account: { ...base, totalValue: 100000 } });
    assert.ok(ids(r).includes('concentration'));
    assert.ok(ids(r).includes('disposition'));
});

test('flags trailing the benchmark and praises clean records', () => {
    const five = Array.from({ length: 5 }, (_, i) => t({ executedAt: `2024-01-0${i + 1}T10:00:00Z` }));
    const behind = detectBehaviours({ trades: five, lots: [], positions: [], account: { ...base, totalValue: 95000, mirrorValue: 101000 } });
    assert.deepEqual(ids(behind), ['behind_benchmark']);
    const clean = detectBehaviours({ trades: five, lots: [], positions: [], account: base });
    assert.deepEqual(ids(clean), ['good_habits']);
    assert.deepEqual(detectBehaviours({ trades: [], lots: [], positions: [], account: base }), []);
});

test('every insight links to an existing lesson', () => {
    const trades = [...Array.from({ length: 6 }, () => t({ dayChangePct: 6, reason: 'tip' })), t({ side: 'sell', dayChangePct: -8 })];
    const r = detectBehaviours({ trades, lots: [], positions: [{ symbol: 'X', value: 90 }], account: { ...base, totalValue: 100, startingCash: 100, mirrorValue: 200 } });
    assert.ok(r.length >= 4);
    for (const b of r) assert.ok(getLesson(b.lesson), b.lesson);
    assert.ok(LESSONS.every((l) => l.body.length >= 2));
});

test('reasonScoreboard groups realised and open results by buying reason', () => {
    const lots = [
        { reason: 'research', symbol: 'A', assetType: 'stock', quantity: '10', quantityOpen: '0', unitCost: '100', realizedPnl: '200' },
        { reason: 'research', symbol: 'B', assetType: 'stock', quantity: '5', quantityOpen: '5', unitCost: '100', realizedPnl: '0' },
        { reason: 'tip', symbol: 'C', assetType: 'stock', quantity: '10', quantityOpen: '0', unitCost: '50', realizedPnl: '-150' },
    ];
    const rows = reasonScoreboard(lots, new Map([['stock:B', 110]]));
    const research = rows.find((r) => r.reason === 'research');
    assert.equal(research.closedLots, 1);
    assert.equal(research.winRate, 1);
    close(research.totalPnl, 250);
    close(research.returnOnInvested, 250 / 1500);
    const tip = rows.find((r) => r.reason === 'tip');
    assert.equal(tip.winRate, 0);
    assert.equal(rows[0].reason, 'research');
});
