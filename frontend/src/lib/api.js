// Thin fetch wrapper for the QuantumTrade API.
// Auth uses an httpOnly session cookie set by the server, so no token is ever
// stored in JS-accessible storage.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

export class ApiError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

let unauthorizedHandler = null;
export const onUnauthorized = (fn) => {
    unauthorizedHandler = fn;
};

export async function api(path, { method = 'GET', body, signal } = {}) {
    let res;
    try {
        res = await fetch(BASE + path, {
            method,
            // 'include' only matters when VITE_API_URL points at another origin.
            credentials: import.meta.env.VITE_API_URL ? 'include' : 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...(body !== undefined && { 'Content-Type': 'application/json' }),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new ApiError(0, 'Network error – check your connection and try again.');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        if (res.status === 401 && !path.startsWith('/auth/login')) unauthorizedHandler?.();
        let message = data?.error || `Request failed (${res.status})`;
        if (data?.details?.length) message = data.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; ');
        throw new ApiError(res.status, message, data?.details);
    }
    return data;
}

const q = (params) => {
    const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString();
    return s ? `?${s}` : '';
};
const enc = encodeURIComponent;

export const Auth = {
    me: () => api('/auth/me'),
    login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }),
    register: (body) => api('/auth/register', { method: 'POST', body }),
    logout: () => api('/auth/logout', { method: 'POST' }),
    logoutAll: () => api('/auth/logout-all', { method: 'POST' }),
    changePassword: (currentPassword, newPassword) => api('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
    deleteAccount: (password) => api('/auth/me', { method: 'DELETE', body: { password } }),
};

export const Market = {
    quote: (assetType, symbol, opts) => api(`/market/quote/${assetType}/${enc(symbol)}`, opts),
    search: (assetType, query, opts) => api(`/market/search${q({ assetType, q: query })}`, opts),
    topCryptos: (limit = 20, opts) => api(`/market/crypto/top${q({ limit })}`, opts),
    cryptoInfo: (symbol, opts) => api(`/market/crypto/${enc(symbol)}/info`, opts),
    analysis: (assetType, symbol, opts) => api(`/market/analysis/${assetType}/${enc(symbol)}`, opts),
};

export const Watchlist = {
    list: (opts) => api('/watchlist', opts),
    add: (assetType, symbol) => api('/watchlist', { method: 'POST', body: { assetType, symbol } }),
    remove: (assetType, symbol) => api(`/watchlist/${assetType}/${enc(symbol)}`, { method: 'DELETE' }),
};

export const Portfolio = {
    summary: (opts) => api('/portfolio', opts),
    transactions: (params = {}, opts) => api(`/portfolio/transactions${q(params)}`, opts),
    addTransaction: (body) => api('/portfolio/transactions', { method: 'POST', body }),
    deleteTransaction: (id) => api(`/portfolio/transactions/${id}`, { method: 'DELETE' }),
};

export const Alerts = {
    list: (opts) => api('/alerts', opts),
    create: (body) => api('/alerts', { method: 'POST', body }),
    update: (id, body) => api(`/alerts/${id}`, { method: 'PATCH', body }),
    remove: (id) => api(`/alerts/${id}`, { method: 'DELETE' }),
    check: () => api('/alerts/check', { method: 'POST' }),
};
