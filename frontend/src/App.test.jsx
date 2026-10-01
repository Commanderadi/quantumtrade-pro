import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { AppRoutes } from './App';

/** Routes fetch calls to handlers keyed by "METHOD /path". */
function mockApi(handlers) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
        const path = url.replace(/^\/api/, '').split('?')[0];
        const key = `${init.method || 'GET'} ${path}`;
        const handler = handlers[key];
        if (!handler) return { status: 404, ok: false, json: async () => ({ error: `No mock for ${key}` }) };
        const [status, body] = handler(init.body ? JSON.parse(init.body) : undefined);
        return { status, ok: status < 400, json: async () => body };
    });
}

const renderApp = (path = '/') =>
    render(
        <ThemeProvider>
            <AuthProvider>
                <CurrencyProvider>
                    <MemoryRouter initialEntries={[path]}>
                        <AppRoutes />
                    </MemoryRouter>
                </CurrencyProvider>
            </AuthProvider>
        </ThemeProvider>
    );

const user = { id: 1, username: 'alice', email: 'alice@example.com', createdAt: '2024-01-01T00:00:00Z' };
const signedInHandlers = {
    'GET /portfolio': () => [200, { positions: [], totals: [] }],
    'GET /watchlist': () => [200, { items: [{ id: 1, symbol: 'AAPL', assetType: 'stock', quote: { price: 190.12, changePercent: 1.5, currency: 'USD', asOf: '2024-05-01T00:00:00Z' } }] }],
    'GET /alerts': () => [200, { alerts: [] }],
    'GET /market/indices': () => [200, { indices: [
        { label: 'S&P 500 (SPY ETF)', symbol: 'SPY', quote: { price: 500, changePercent: 0.4, currency: 'USD' }, error: null },
        { label: 'Nifty 50 (NIFTYBEES ETF)', symbol: 'NIFTYBEES.NSE', quote: null, error: 'Twelve Data: not available on your plan' },
    ] }],
    'GET /market/crypto/top': () => [200, { coins: [{ coinId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 60000, changePercent: -2 }] }],
};

describe('App', () => {
    it('redirects anonymous users to the login page', async () => {
        mockApi({ 'GET /auth/me': () => [401, { error: 'Authentication required' }] });
        renderApp('/portfolio');
        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('logs in and shows the dashboard', async () => {
        const fetchSpy = mockApi({
            'GET /auth/me': () => [401, { error: 'Authentication required' }],
            'POST /auth/login': (body) =>
                body.password === 'secret123' ? [200, { user }] : [401, { error: 'Invalid email or password' }],
            ...signedInHandlers,
        });
        renderApp('/login');
        await screen.findByRole('heading', { name: 'Sign in' });

        await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
        await userEvent.type(screen.getByLabelText('Password'), 'wrong');
        await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');

        await userEvent.clear(screen.getByLabelText('Password'));
        await userEvent.type(screen.getByLabelText('Password'), 'secret123');
        await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
        expect(await screen.findByRole('link', { name: 'AAPL' })).toHaveAttribute('href', '/analysis/stock/AAPL');
        expect(screen.getByText('+1.50%')).toBeInTheDocument();
        expect(await screen.findByText('Bitcoin')).toBeInTheDocument();
        expect(screen.getByText('No holdings yet')).toBeInTheDocument();
        // The session lives in an httpOnly cookie; nothing is written to storage.
        expect(localStorage.getItem('token')).toBeNull();
        expect(fetchSpy).toHaveBeenCalled();
    });

    it('signs the user out when the session expires', async () => {
        mockApi({
            'GET /auth/me': () => [200, { user }],
            ...signedInHandlers,
            'GET /portfolio': () => [401, { error: 'Session expired or invalid' }],
        });
        renderApp('/');
        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('shows market indices, including ones that are unavailable', async () => {
        mockApi({ 'GET /auth/me': () => [200, { user }], ...signedInHandlers });
        renderApp('/');
        expect(await screen.findByText('S&P 500 (SPY ETF)')).toBeInTheDocument();
        expect(screen.getByText('Nifty 50 (NIFTYBEES ETF)')).toBeInTheDocument();
        expect(screen.getByText('Twelve Data: not available on your plan')).toBeInTheDocument();
    });

    it('converts portfolio totals into the chosen currency', async () => {
        const fetchSpy = mockApi({
            'GET /auth/me': () => [200, { user }],
            ...signedInHandlers,
            'GET /portfolio': () => [200, {
                positions: [],
                totals: [
                    { currency: 'USD', marketValue: 1000 }, { currency: 'INR', marketValue: 50000 },
                ],
                combined: {
                    currency: 'INR', marketValue: 134000, costBasis: 120000, unrealizedPnl: 14000, unrealizedPnlPercent: 11.67,
                    realizedPnl: 0, dayChange: 500, dayChangePercent: 0.37, rates: { USD: 84, INR: 1 }, missingRates: [],
                },
            }],
        });
        localStorage.setItem('quantumtrade-display-currency', 'INR');
        renderApp('/');
        expect(await screen.findByRole('heading', { name: 'Portfolio (INR)' })).toBeInTheDocument();
        expect(screen.getByText(/1 USD = /)).toBeInTheDocument();
        const portfolioCall = fetchSpy.mock.calls.find(([url]) => String(url).startsWith('/api/portfolio'));
        expect(portfolioCall[0]).toBe('/api/portfolio?currency=INR');
        localStorage.removeItem('quantumtrade-display-currency');
    });

    it('tells the user when another listing was used for the symbol they looked up', async () => {
        mockApi({
            'GET /auth/me': () => [200, { user }],
            ...signedInHandlers,
            'GET /market/quote/stock/TCS.NSE': () => [200, { quote: {
                symbol: 'TCS.BSE', resolvedFrom: 'TCS.NSE', currency: 'INR', price: 3900, changePercent: 0.5, asOf: '2024-05-01T00:00:00Z', source: 'Alpha Vantage',
                open: null, high: null, low: null, previousClose: null, volume: null,
                note: 'Showing TCS.BSE (BSE listing) because TCS.NSE could not be loaded on your data plan.',
            } }],
        });
        renderApp('/markets?type=stock&symbol=TCS.NSE');
        expect(await screen.findByText(/Showing TCS\.BSE \(BSE listing\)/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'TCS.BSE' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Analyze/ })).toHaveAttribute('href', '/analysis/stock/TCS.BSE');
    });
});
