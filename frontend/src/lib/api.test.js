import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, onUnauthorized, Watchlist } from './api';

const respond = (status, body) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        status,
        ok: status < 400,
        json: async () => body,
    });

describe('api client', () => {
    it('sends JSON with the CSRF header and parses responses', async () => {
        const spy = respond(201, { item: { symbol: 'AAPL' } });
        const res = await Watchlist.add('stock', 'AAPL');
        expect(res.item.symbol).toBe('AAPL');
        const [url, init] = spy.mock.calls[0];
        expect(url).toBe('/api/watchlist');
        expect(init.method).toBe('POST');
        expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(init.body)).toEqual({ assetType: 'stock', symbol: 'AAPL' });
    });

    it('encodes path segments', async () => {
        const spy = respond(204);
        await Watchlist.remove('stock', 'BRK/B');
        expect(spy.mock.calls[0][0]).toBe('/api/watchlist/stock/BRK%2FB');
    });

    it('turns validation details into a readable error', async () => {
        respond(400, { error: 'Validation failed', details: [{ field: 'quantity', message: 'Must be greater than 0' }] });
        await expect(api('/portfolio/transactions', { method: 'POST', body: {} })).rejects.toMatchObject({
            status: 400,
            message: 'quantity: Must be greater than 0',
        });
    });

    it('notifies the auth layer on 401', async () => {
        const handler = vi.fn();
        onUnauthorized(handler);
        respond(401, { error: 'Authentication required' });
        await expect(api('/portfolio')).rejects.toBeInstanceOf(ApiError);
        expect(handler).toHaveBeenCalledOnce();
    });

    it('reports network failures', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(api('/portfolio')).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/Network error/) });
    });
});
