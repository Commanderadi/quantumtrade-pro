import { describe, expect, it } from 'vitest';
import { formatFraction, formatMoney, formatPercent, formatQuantity, formatSignedMoney, trendClass } from './format';

describe('format helpers', () => {
    it('formats money with currency and extra precision for sub-unit prices', () => {
        expect(formatMoney(1234.5, 'USD')).toMatch(/1,234\.50/);
        expect(formatMoney(0.00012345, 'USD')).toMatch(/0\.000123/);
        expect(formatMoney(null)).toBe('—');
        expect(formatMoney(100, 'INR')).toMatch(/₹/);
    });

    it('signs percentages and money', () => {
        expect(formatPercent(1.234)).toBe('+1.23%');
        expect(formatPercent(-0.5)).toBe('-0.50%');
        expect(formatSignedMoney(5, 'USD')).toMatch(/^\+/);
    });

    it('formats fractions as percentages without a negative zero', () => {
        expect(formatFraction(0.1234)).toBe('12.3%');
        expect(formatFraction(0.05, { signed: true })).toBe('+5.0%');
        expect(formatFraction(-0.0000001)).toBe('0.0%');
        expect(formatFraction(null)).toBe('—');
    });

    it('trims trailing zeros from quantities', () => {
        expect(formatQuantity('1.50000000')).toBe('1.5');
        expect(formatQuantity('10.00000000')).toBe('10');
        expect(formatQuantity('0.00000001')).toBe('0.00000001');
    });

    it('maps values to trend classes', () => {
        expect(trendClass(1)).toBe('up');
        expect(trendClass(-1)).toBe('down');
        expect(trendClass(0)).toBe('');
        expect(trendClass(null)).toBe('');
    });
});
