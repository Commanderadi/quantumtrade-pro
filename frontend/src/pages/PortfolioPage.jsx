import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Portfolio } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate, formatMoney, formatPercent, formatQuantity, formatSignedMoney, trendClass } from '../lib/format';
import { AssetBadge, Card, Change, EmptyState, ErrorMessage, Segmented, Spinner, Stat, ASSET_OPTIONS } from '../components/ui';

const PAGE_SIZE = 25;
const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16', '#6366f1', '#f97316'];

export default function PortfolioPage() {
    const summary = useAsync((signal) => Portfolio.summary({ signal }), []);
    const [page, setPage] = useState(0);
    const txs = useAsync((signal) => Portfolio.transactions({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }, { signal }), [page]);
    const [showForm, setShowForm] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [showClosed, setShowClosed] = useState(false);

    const refresh = () => {
        summary.reload();
        txs.reload();
    };

    const deleteTx = async (tx) => {
        if (!window.confirm(`Delete this ${tx.side} of ${formatQuantity(tx.quantity)} ${tx.symbol}?`)) return;
        setActionError(null);
        try {
            await Portfolio.deleteTransaction(tx.id);
            refresh();
        } catch (err) {
            setActionError(err);
        }
    };

    const positions = summary.data?.positions ?? [];
    const visible = showClosed ? positions : positions.filter((p) => p.isOpen);
    const closedCount = positions.length - positions.filter((p) => p.isOpen).length;

    return (
        <div className="page">
            <div className="page-header">
                <h1>Portfolio</h1>
                <button type="button" className="btn btn-primary" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
                    <FiPlus aria-hidden="true" /> Record trade
                </button>
            </div>

            {showForm && (
                <TransactionForm
                    onDone={() => {
                        setShowForm(false);
                        setPage(0);
                        refresh();
                    }}
                    onCancel={() => setShowForm(false)}
                />
            )}

            {summary.loading && !summary.data ? (
                <Spinner label="Loading portfolio…" />
            ) : summary.error ? (
                <ErrorMessage error={summary.error} onRetry={summary.reload} />
            ) : positions.length === 0 ? (
                <Card>
                    <EmptyState title="No trades recorded yet">Use “Record trade” to add your first buy. Holdings, cost basis and P&L are calculated from your trades.</EmptyState>
                </Card>
            ) : (
                <>
                    {summary.data.totals.map((t) => (
                        <TotalsCard key={t.currency} totals={t} positions={positions.filter((p) => p.currency === t.currency && p.marketValue)} />
                    ))}

                    <Card
                        title="Holdings"
                        actions={
                            closedCount > 0 && (
                                <label className="checkbox small">
                                    <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed ({closedCount})
                                </label>
                            )
                        }
                    >
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Asset</th>
                                        <th className="num">Quantity</th>
                                        <th className="num">Avg cost</th>
                                        <th className="num">Price</th>
                                        <th className="num">Market value</th>
                                        <th className="num">Unrealized</th>
                                        <th className="num hide-sm">Realized</th>
                                        <th className="num hide-sm">Weight</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((p) => (
                                        <tr key={`${p.assetType}:${p.symbol}`} className={p.isOpen ? '' : 'muted'}>
                                            <td>
                                                <Link className="symbol-link" to={`/analysis/${p.assetType}/${encodeURIComponent(p.symbol)}`}>{p.symbol}</Link> <AssetBadge type={p.assetType} />
                                            </td>
                                            <td className="num">{formatQuantity(p.quantity)}</td>
                                            <td className="num">{p.isOpen ? formatMoney(p.averageCost, p.currency) : '—'}</td>
                                            <td className="num">
                                                {p.price !== null ? (
                                                    <>
                                                        {formatMoney(p.price, p.currency)} <Change value={p.changePercent} />
                                                    </>
                                                ) : p.isOpen ? (
                                                    <span className="muted small" title={p.quoteError}>unavailable</span>
                                                ) : '—'}
                                            </td>
                                            <td className="num">{formatMoney(p.marketValue, p.currency)}</td>
                                            <td className={`num ${trendClass(p.unrealizedPnl)}`}>
                                                {p.unrealizedPnl === null ? '—' : <>{formatSignedMoney(p.unrealizedPnl, p.currency)}<br /><span className="small">{formatPercent(p.unrealizedPnlPercent)}</span></>}
                                            </td>
                                            <td className={`num hide-sm ${trendClass(p.realizedPnl)}`}>{formatSignedMoney(p.realizedPnl, p.currency)}</td>
                                            <td className="num hide-sm">{p.allocationPercent === null ? '—' : `${p.allocationPercent.toFixed(1)}%`}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}

            <Card title="Trade history">
                <ErrorMessage error={actionError} />
                {txs.loading && !txs.data ? (
                    <Spinner />
                ) : txs.error ? (
                    <ErrorMessage error={txs.error} onRetry={txs.reload} />
                ) : txs.data.transactions.length === 0 ? (
                    <EmptyState title="No trades yet" />
                ) : (
                    <>
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Asset</th>
                                        <th>Side</th>
                                        <th className="num">Quantity</th>
                                        <th className="num">Price</th>
                                        <th className="num hide-sm">Fee</th>
                                        <th className="num">Total</th>
                                        <th className="num hide-sm">Realized</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {txs.data.transactions.map((t) => {
                                        const gross = Number(t.quantity) * Number(t.price);
                                        const total = t.side === 'buy' ? gross + Number(t.fee) : gross - Number(t.fee);
                                        return (
                                            <tr key={t.id}>
                                                <td>{formatDate(t.executedAt)}</td>
                                                <td>{t.symbol} <AssetBadge type={t.assetType} /></td>
                                                <td><span className={`side side-${t.side}`}>{t.side}</span></td>
                                                <td className="num">{formatQuantity(t.quantity)}</td>
                                                <td className="num">{formatMoney(t.price, t.currency)}</td>
                                                <td className="num hide-sm">{formatMoney(t.fee, t.currency)}</td>
                                                <td className="num">{formatMoney(total, t.currency)}</td>
                                                <td className={`num hide-sm ${trendClass(t.realizedPnl)}`}>{t.realizedPnl === null ? '—' : formatSignedMoney(t.realizedPnl, t.currency)}</td>
                                                <td className="actions">
                                                    <button type="button" className="icon-btn" onClick={() => deleteTx(t)} aria-label={`Delete trade ${t.id}`}>
                                                        <FiTrash2 />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pager page={page} setPage={setPage} total={txs.data.total} />
                    </>
                )}
            </Card>
        </div>
    );
}

function TotalsCard({ totals: t, positions }) {
    const data = useMemo(
        () => positions.map((p) => ({ name: p.symbol, value: p.marketValue })).sort((a, b) => b.value - a.value),
        [positions]
    );
    return (
        <Card title={`Summary (${t.currency})`}>
            <div className="totals">
                <div className="stats">
                    <Stat label="Market value" value={formatMoney(t.marketValue, t.currency)} />
                    <Stat label="Cost basis" value={formatMoney(t.costBasis, t.currency)} />
                    <Stat label="Today" value={formatSignedMoney(t.dayChange, t.currency)} sub={formatPercent(t.dayChangePercent)} tone={t.dayChange} />
                    <Stat label="Unrealized P&L" value={formatSignedMoney(t.unrealizedPnl, t.currency)} sub={formatPercent(t.unrealizedPnlPercent)} tone={t.unrealizedPnl} />
                    <Stat label="Realized P&L" value={formatSignedMoney(t.realizedPnl, t.currency)} tone={t.realizedPnl} />
                </div>
                {data.length > 0 && (
                    <div className="allocation" aria-label="Allocation chart">
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={1} isAnimationActive={false}>
                                    {data.map((d, i) => <Cell key={d.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v) => formatMoney(v, t.currency)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
            {t.unpricedPositions > 0 && <p className="muted small">{t.unpricedPositions} open position(s) have no live price right now and are excluded from the totals above.</p>}
        </Card>
    );
}

function Pager({ page, setPage, total }) {
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) return null;
    return (
        <div className="pager">
            <button type="button" className="btn btn-small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="muted small">Page {page + 1} of {pages}</span>
            <button type="button" className="btn btn-small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
    );
}

const today = () => new Date().toISOString().slice(0, 10);

function TransactionForm({ onDone, onCancel }) {
    const [form, setForm] = useState({ assetType: 'stock', symbol: '', side: 'buy', quantity: '', price: '', fee: '', currency: '', date: today(), note: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target ? e.target.value : e }));

    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            // A date-only trade is stored at 12:00 UTC so it lands on the same calendar day everywhere.
            const executedAt = form.date === today() ? undefined : `${form.date}T12:00:00Z`;
            await Portfolio.addTransaction({
                assetType: form.assetType,
                symbol: form.symbol.trim(),
                side: form.side,
                quantity: form.quantity,
                price: form.price,
                fee: form.fee || '0',
                ...(form.currency && { currency: form.currency }),
                ...(executedAt && { executedAt }),
                ...(form.note && { note: form.note }),
            });
            onDone();
        } catch (err) {
            setError(err);
            setBusy(false);
        }
    };

    return (
        <Card title="Record a trade">
            <form className="form form-grid" onSubmit={submit}>
                <div className="field-full">
                    <Segmented label="Asset type" value={form.assetType} onChange={set('assetType')} options={ASSET_OPTIONS} />
                </div>
                <label>
                    Symbol
                    <input value={form.symbol} onChange={set('symbol')} required maxLength={20} placeholder={form.assetType === 'crypto' ? 'BTC' : 'AAPL or RELIANCE.BSE'} autoCapitalize="characters" spellCheck="false" />
                </label>
                <label>
                    Side
                    <select value={form.side} onChange={set('side')}>
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                    </select>
                </label>
                <label>
                    Quantity
                    <input type="number" inputMode="decimal" min="0" step="any" value={form.quantity} onChange={set('quantity')} required />
                </label>
                <label>
                    Price per unit
                    <input type="number" inputMode="decimal" min="0" step="any" value={form.price} onChange={set('price')} required />
                </label>
                <label>
                    Fee (optional)
                    <input type="number" inputMode="decimal" min="0" step="any" value={form.fee} onChange={set('fee')} />
                </label>
                <label>
                    Trade date
                    <input type="date" value={form.date} max={today()} onChange={set('date')} required />
                </label>
                <label>
                    Currency (optional)
                    <input value={form.currency} onChange={set('currency')} maxLength={3} placeholder="Auto" autoCapitalize="characters" />
                    <span className="hint">Defaults to the listing currency (e.g. INR for .BSE).</span>
                </label>
                <label className="field-full">
                    Note (optional)
                    <input value={form.note} onChange={set('note')} maxLength={255} />
                </label>
                <div className="field-full">
                    <ErrorMessage error={error} />
                </div>
                <div className="form-actions field-full">
                    <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save trade'}</button>
                </div>
            </form>
        </Card>
    );
}
