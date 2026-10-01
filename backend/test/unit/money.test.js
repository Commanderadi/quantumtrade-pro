'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toUnits, fromUnits, mul, div } = require('../../src/utils/money');

test('round-trips decimal strings exactly', () => {
    for (const v of ['0.00000001', '123456789.12345678', '-5.5', '0']) {
        assert.equal(Number(fromUnits(toUnits(v))), Number(v));
    }
    assert.equal(fromUnits(toUnits('1.5')), '1.50000000');
});

test('rounds half up beyond 8 decimal places', () => {
    assert.equal(fromUnits(toUnits('0.000000015')), '0.00000002');
    assert.equal(fromUnits(toUnits('0.000000014')), '0.00000001');
});

test('avoids floating point error', () => {
    assert.equal(fromUnits(toUnits('0.1') + toUnits('0.2')), '0.30000000');
    assert.equal(fromUnits(mul(toUnits('0.1'), toUnits('3'))), '0.30000000');
});

test('divides with rounding for positive and negative values', () => {
    assert.equal(fromUnits(div(toUnits('10'), toUnits('3'))), '3.33333333');
    assert.equal(fromUnits(div(toUnits('2'), toUnits('3'))), '0.66666667');
    assert.equal(fromUnits(div(toUnits('-2'), toUnits('3'))), '-0.66666667');
    assert.throws(() => div(1n, 0n), RangeError);
});

test('rejects non-numeric input', () => {
    assert.throws(() => toUnits('abc'), TypeError);
    assert.throws(() => toUnits('1e5'), TypeError);
});
