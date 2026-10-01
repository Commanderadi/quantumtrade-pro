import { useState } from 'react';
import { Link } from 'react-router';
import { FiTrash2 } from 'react-icons/fi';
import { Alerts, Market, Portfolio, Watchlist } from '../lib/api';
import { useAsync, useInterval } from '../lib/useAsync';
import { formatDate, formatMoney, formatNumber, formatSignedMoney, formatPercent, ALERT_CONDITIONS } from '../lib/format';
import { AssetBadge, Card, Change, EmptyState, ErrorMessage, Notice, Spinner, Stat } from '../components/ui';
import SymbolSearch from '../components/SymbolSearch';
import IndicesStrip from '../components/IndicesStrip';
import CombinedTotals from '../components/CombinedTotals';
import CurrencySelect from '../components/CurrencySelect';
import { useCurrency } from '../context/CurrencyContext';

const REFRESH_MS = 60_000;

export default function Dashboard() {
    const { apiCurrency } = useCurrency();
    const portfolio = useAsync((signal) => Portfolio.summary(apiCurrency, { signal }), [apiCurrency]);
    const watchlist = useAsync((signal) => Watchlist.list({ signal }), []);
    const alerts = useAsync((signal) => Alerts.list({ signal }), []);
    const top = useAsync((signal) => Market.topCryptos(8, { signal }), []);
    const [addError, setAddError] = useState(null);
    const [adding, setAdding] = useState(false);

    useInterval(() => {
        watchlist.reload();
        portfolio.reload();
        alerts.reload();
    }, REFRESH_MS);

    const addToWatchlist = async ({ assetType, symbol }) => {
        setAddError(null);
        setAdding(true);
        try {
            await Watchlist.add(assetType, symbol);
            watchlist.reload();
        } catch (err) {
            setAddError(err);
        } finally {
            setAdding(false);
        }
    };

    const remove = async (item) => {
        watchlist.setData((d) => ({ items: d.items.filter((i) => i.id !== item.id) }));
        try {
            await Watchlist.remove(item.assetType, item.symbol);
        } catch (err) {
            setAddError(err);
            watchlist.reload();
        }
    };

    const recentlyTriggered = (alerts.data?.alerts ?? [])
        .filter((a) => a.triggeredAt && Date.now() - new Date(a.triggeredAt).getTime() < 7 * 86400_000)
        .slice(0, 5);

    return (
        <div className="page">
            <div className="page-header">
                <h1>Dashboard</h1>
                <CurrencySelect />
            </div>

            <IndicesStrip />

            {recentlyTriggered.length > 0 && (
                <Notice tone="warning">
                    <strong>Triggered alerts:</strong>{' '}
                    {recentlyTriggered.map((a) => (
                        <span key={a.id} className="inline-item">
                            {a.symbol} — {ALERT_CONDITIONS[a.condition]} {formatNumber(a.targetValue, { maxDigits: 8 })} ({formatDate(a.triggeredAt, { time: true })})
                        </span>
                    ))}{' '}
                    <Link to="/alerts">Manage alerts</Link>
                </Notice>
            )}

            <PortfolioOverview state={portfolio} />

            <div className="grid grid-2">
                <Card title="Watchlist" className="span-2-lg">
                    <SymbolSearch onSelect={addToWatchlist} submitLabel="Add" busy={adding} />
                    <ErrorMessage error={addError} />
                    {watchlist.loading && !watchlist.data ? (
                        <Spinner />
                    ) : watchlist.error ? (
                        <ErrorMessage error={watchlist.error} onRetry={watchlist.reload} />
                    ) : watchlist.data.items.length === 0 ? (
                        <EmptyState title="Your watchlist is empty">Search for a stock or cryptocurrency above to start tracking it.</EmptyState>
                    ) : (
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Symbol</th>
                                        <th className="num">Price</th>
                                        <th className="num">Change</th>
                                        <th className="hide-sm">As of</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {watchlist.data.items.map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                <Link to={`/analysis/${item.assetType}/${encodeURIComponent(item.symbol)}`} className="symbol-link">
                                                    {item.symbol}
                                                </Link>{' '}
                                                <AssetBadge type={item.assetType} />
                                            </td>
                                            {item.quote ? (
                                                <>
                                                    <td className="num">{formatMoney(item.quote.price, item.quote.currency)}</td>
                                                    <td className="num"><Change value={item.quote.changePercent} /></td>
                                                    <td className="hide-sm muted small">{formatDate(item.quote.asOf, { time: item.assetType === 'crypto' })}</td>
                                                </>
                                            ) : (
                                                <td colSpan={3} className="muted small">{item.quoteError || 'Quote unavailable'}</td>
                                            )}
                                            <td className="actions">
                                                <button type="button" className="icon-btn" onClick={() => remove(item)} aria-label={`Remove ${item.symbol}`}>
                                                    <FiTrash2 />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <Card title="Top cryptocurrencies" actions={<Link to="/markets" className="small">More</Link>}>
                    {top.loading && !top.data ? (
                        <Spinner />
                    ) : top.error ? (
                        <ErrorMessage error={top.error} onRetry={top.reload} />
                    ) : (
                        <ul className="coin-list">
                            {top.data.coins.map((c) => (
                                <li key={c.coinId}>
                                    <Link to={`/analysis/crypto/${encodeURIComponent(c.symbol)}`}>
                                        {c.image && <img src={c.image} alt="" width="20" height="20" loading="lazy" />}
                                        <span className="coin-name">{c.name} <span className="muted">{c.symbol}</span></span>
                                    </Link>
                                    <span className="num">{formatMoney(c.price)}</span>
                                    <Change value={c.changePercent} />
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </div>
    );
}

function PortfolioOverview({ state }) {
    if (state.loading && !state.data) return <Spinner label="Loading portfolio…" />;
    if (state.error) return <ErrorMessage error={state.error} onRetry={state.reload} />;
    const { totals, combined } = state.data;
    if (!totals.length) {
        return (
            <Card>
                <EmptyState title="No holdings yet">
                    <Link to="/portfolio">Record your first trade</Link> to see your portfolio value and performance here.
                </EmptyState>
            </Card>
        );
    }
    if (combined) {
        return <CombinedTotals combined={combined} action={<Link to="/portfolio" className="small">Details</Link>} />;
    }
    return (
        <div className="grid grid-auto">
            {totals.map((t) => (
                <Card key={t.currency} title={`Portfolio (${t.currency})`} actions={<Link to="/portfolio" className="small">Details</Link>}>
                    <div className="stats">
                        <Stat label="Market value" value={formatMoney(t.marketValue, t.currency)} />
                        <Stat label="Today" value={formatSignedMoney(t.dayChange, t.currency)} sub={formatPercent(t.dayChangePercent)} tone={t.dayChange} />
                        <Stat label="Unrealized P&L" value={formatSignedMoney(t.unrealizedPnl, t.currency)} sub={formatPercent(t.unrealizedPnlPercent)} tone={t.unrealizedPnl} />
                        <Stat label="Realized P&L" value={formatSignedMoney(t.realizedPnl, t.currency)} tone={t.realizedPnl} />
                    </div>
                    {t.unpricedPositions > 0 && (
                        <p className="muted small">{t.unpricedPositions} position(s) could not be priced right now and are excluded from totals.</p>
                    )}
                </Card>
            ))}
        </div>
    );
}
