'use strict';

const { z } = require('zod');

const assetType = z.enum(['stock', 'crypto']);

// Stocks: AAPL, BRK.B, RELIANCE.BSE, ^GSPC. Crypto: BTC, ETH, 1INCH.
const STOCK_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-=]{0,19}$/;
const CRYPTO_SYMBOL = /^[A-Z0-9]{1,15}$/;

const rawSymbol = z.string().trim().min(1).max(20).transform((s) => s.toUpperCase());

/** Adds a symbol format check that depends on the sibling `assetType` field. */
const withSymbol = (shape = {}) =>
    z.object({ assetType, symbol: rawSymbol, ...shape }).superRefine((v, ctx) => {
        const re = v.assetType === 'crypto' ? CRYPTO_SYMBOL : STOCK_SYMBOL;
        if (!re.test(v.symbol)) ctx.addIssue({ code: 'custom', path: ['symbol'], message: `Invalid ${v.assetType} symbol` });
    });

// Accepts JSON numbers or numeric strings; returns a canonical decimal string (max 8 dp).
const decimal = ({ min = 0, allowZero = false } = {}) =>
    z
        .union([z.number(), z.string().trim()])
        .transform((v) => (typeof v === 'number' ? String(v) : v))
        .refine((v) => /^\d{1,20}(\.\d{1,8})?$/.test(v), 'Must be a positive number with at most 8 decimal places')
        .refine((v) => (allowZero ? Number(v) >= min : Number(v) > min), allowZero ? `Must be at least ${min}` : `Must be greater than ${min}`);

const signedDecimal = z
    .union([z.number(), z.string().trim()])
    .transform((v) => (typeof v === 'number' ? String(v) : v))
    .refine((v) => /^-?\d{1,20}(\.\d{1,8})?$/.test(v), 'Must be a number with at most 8 decimal places');

const id = z.coerce.number().int().positive();

module.exports = { assetType, rawSymbol, withSymbol, decimal, signedDecimal, id, STOCK_SYMBOL, CRYPTO_SYMBOL };
