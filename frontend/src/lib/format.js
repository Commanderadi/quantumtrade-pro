const moneyFormatters = new Map();

export function formatMoney(value, currency = 'USD', { compact = false } = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const n = Number(value);
    // Show more precision for sub-dollar assets (many cryptocurrencies).
    const abs = Math.abs(n);
    const maxDigits = compact ? 2 : abs !== 0 && abs < 1 ? 6 : 2;
    const key = `${currency}:${compact}:${maxDigits}`;
    if (!moneyFormatters.has(key)) {
        moneyFormatters.set(
            key,
            new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency,
                notation: compact ? 'compact' : 'standard',
                minimumFractionDigits: compact ? 0 : 2,
                maximumFractionDigits: maxDigits,
            })
        );
    }
    return moneyFormatters.get(key).format(n);
}

export function formatNumber(value, { maxDigits = 2, compact = false } = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits, notation: compact ? 'compact' : 'standard' }).format(Number(value));
}

/** Quantities come from the API as fixed 8-dp strings; drop trailing zeros. */
export function formatQuantity(value) {
    if (value === null || value === undefined) return '—';
    const s = String(value);
    if (!s.includes('.')) return s;
    return s.replace(/\.?0+$/, '');
}

export function formatPercent(value, { signed = true } = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const n = Number(value);
    const sign = signed && n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
}

export function formatSignedMoney(value, currency) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    return `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`;
}

export function formatDate(value, { time = false } = {}) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return time ? d.toLocaleString() : d.toLocaleDateString();
}

export const trendClass = (value) => {
    if (value === null || value === undefined) return '';
    const n = Number(value);
    return n > 0 ? 'up' : n < 0 ? 'down' : '';
};

export const ALERT_CONDITIONS = {
    price_above: 'Price rises to or above',
    price_below: 'Price falls to or below',
    change_pct_above: 'Daily change ≥ (%)',
    change_pct_below: 'Daily change ≤ (%)',
};

/** Formats a FRACTION (0.123) as a percentage ("12.3%"). */
export function formatFraction(value, { dp = 1, signed = false } = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    let n = Number(value) * 100;
    if (Math.abs(n) < 0.5 / 10 ** dp) n = 0; // avoid "-0.0%"
    return `${signed && n > 0 ? '+' : ''}${n.toFixed(dp)}%`;
}

export const formatRatio = (value, dp = 2) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(dp));
