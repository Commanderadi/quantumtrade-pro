'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAlert } = require('../../src/services/alerts');

const quote = { price: 100, changePercent: -3.5 };

test('price alerts trigger at or beyond the target', () => {
    assert.equal(evaluateAlert({ condition: 'price_above', target_value: '100' }, quote), 100);
    assert.equal(evaluateAlert({ condition: 'price_above', target_value: '100.01' }, quote), null);
    assert.equal(evaluateAlert({ condition: 'price_below', target_value: '100.5' }, quote), 100);
    assert.equal(evaluateAlert({ condition: 'price_below', target_value: '99' }, quote), null);
});

test('percent change alerts use the daily change', () => {
    assert.equal(evaluateAlert({ condition: 'change_pct_below', target_value: '-3' }, quote), -3.5);
    assert.equal(evaluateAlert({ condition: 'change_pct_above', target_value: '2' }, quote), null);
    assert.equal(evaluateAlert({ condition: 'change_pct_above', target_value: '2' }, { price: 1, changePercent: null }), null);
});
