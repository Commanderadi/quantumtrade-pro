'use strict';

// Quantities and prices are stored as DECIMAL(28,8) and arrive from mysql2 as
// strings. All arithmetic is done on scaled BigInts so that portfolio maths
// never accumulates floating point error.
const SCALE = 8;
const FACTOR = 10n ** BigInt(SCALE);

function toUnits(value) {
    const str = typeof value === 'number' ? value.toFixed(SCALE) : String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) throw new TypeError(`Invalid decimal: ${value}`);
    const negative = str.startsWith('-');
    const [intPart, fracPart = ''] = str.replace('-', '').split('.');
    // Round half up on the 9th decimal.
    const frac = (fracPart + '0'.repeat(SCALE + 1)).slice(0, SCALE + 1);
    let units = BigInt(intPart) * FACTOR + BigInt(frac.slice(0, SCALE));
    if (Number(frac[SCALE]) >= 5) units += 1n;
    return negative ? -units : units;
}

function fromUnits(units) {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const intPart = abs / FACTOR;
    const fracPart = (abs % FACTOR).toString().padStart(SCALE, '0');
    return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/** (a * b) at SCALE precision, rounded half up. */
function mul(a, b) {
    const product = a * b;
    const half = FACTOR / 2n;
    return product >= 0n ? (product + half) / FACTOR : (product - half) / FACTOR;
}

/** (a / b) at SCALE precision, rounded half up. */
function div(a, b) {
    if (b === 0n) throw new RangeError('Division by zero');
    const negative = (a < 0n) !== (b < 0n);
    const num = (a < 0n ? -a : a) * FACTOR;
    const den = b < 0n ? -b : b;
    const q = (num + den / 2n) / den;
    return negative ? -q : q;
}

module.exports = { SCALE, toUnits, fromUnits, mul, div };
