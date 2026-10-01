import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { Alerts } from '../lib/api';
import { useAsync, useInterval } from '../lib/useAsync';
import { ALERT_CONDITIONS, formatDate, formatNumber } from '../lib/format';
import { AssetBadge, Card, EmptyState, ErrorMessage, Notice, Segmented, Spinner, ASSET_OPTIONS } from '../components/ui';

const isPct = (c) => c.startsWith('change_pct');
const describe = (a) => `${ALERT_CONDITIONS[a.condition]} ${formatNumber(a.targetValue, { maxDigits: 8 })}${isPct(a.condition) ? '%' : ''}`;

export default function AlertsPage() {
    const alerts = useAsync((signal) => Alerts.list({ signal }), []);
    const [error, setError] = useState(null);
    const [checkResult, setCheckResult] = useState(null);
    const [checking, setChecking] = useState(false);
    useInterval(alerts.reload, 60_000);

    const run = async (fn) => {
        setError(null);
        try {
            await fn();
            alerts.reload();
        } catch (err) {
            setError(err);
        }
    };

    const checkNow = async () => {
        setChecking(true);
        setError(null);
        try {
            const result = await Alerts.check();
            setCheckResult(result);
            alerts.setData({ alerts: result.alerts });
        } catch (err) {
            setError(err);
        } finally {
            setChecking(false);
        }
    };

    const list = alerts.data?.alerts ?? [];
    const active = list.filter((a) => a.isActive);
    const inactive = list.filter((a) => !a.isActive);

    return (
        <div className="page">
            <div className="page-header">
                <h1>Price alerts</h1>
                <button type="button" className="btn" onClick={checkNow} disabled={checking || active.length === 0}>
                    <FiRefreshCw aria-hidden="true" className={checking ? 'spin' : ''} /> Check now
                </button>
            </div>
            <p className="muted">Alerts are checked automatically every few minutes against live prices. Once triggered, an alert switches off until you re-enable it.</p>

            <NewAlertForm onCreated={alerts.reload} />
            <ErrorMessage error={error} />
            {checkResult && (
                <Notice tone={checkResult.triggered ? 'warning' : 'success'}>
                    Checked {checkResult.checked} alert(s): {checkResult.triggered ? `${checkResult.triggered} triggered.` : 'none triggered.'}
                </Notice>
            )}

            {alerts.loading && !alerts.data ? (
                <Spinner />
            ) : alerts.error ? (
                <ErrorMessage error={alerts.error} onRetry={alerts.reload} />
            ) : list.length === 0 ? (
                <Card><EmptyState title="No alerts yet">Create one above to get notified when a price crosses a level.</EmptyState></Card>
            ) : (
                <>
                    {active.length > 0 ? (
                        <AlertTable title={`Active (${active.length})`} alerts={active} run={run} />
                    ) : (
                        <Card title="Active (0)"><p className="muted">No active alerts. Re-arm a triggered alert or create a new one.</p></Card>
                    )}
                    {inactive.length > 0 && <AlertTable title={`Triggered or paused (${inactive.length})`} alerts={inactive} run={run} />}
                </>
            )}
        </div>
    );
}

function AlertTable({ title, alerts, run }) {
    return (
        <Card title={title}>
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Asset</th>
                            <th>Condition</th>
                            <th>Status</th>
                            <th className="hide-sm">Last checked</th>
                            <th aria-label="Actions" />
                        </tr>
                    </thead>
                    <tbody>
                        {alerts.map((a) => (
                            <tr key={a.id}>
                                <td>{a.symbol} <AssetBadge type={a.assetType} /></td>
                                <td>{describe(a)}</td>
                                <td>
                                    {a.triggeredAt ? (
                                        <span className="pill pill-bearish" title={`Observed ${formatNumber(a.triggeredValue, { maxDigits: 8 })}`}>
                                            Triggered {formatDate(a.triggeredAt, { time: true })}
                                        </span>
                                    ) : a.isActive ? (
                                        <span className="pill pill-bullish">Active</span>
                                    ) : (
                                        <span className="pill pill-neutral">Paused</span>
                                    )}
                                </td>
                                <td className="hide-sm muted small">{formatDate(a.lastCheckedAt, { time: true })}</td>
                                <td className="actions">
                                    <button type="button" className="btn btn-small" onClick={() => run(() => Alerts.update(a.id, { isActive: !a.isActive }))}>
                                        {a.isActive ? 'Pause' : a.triggeredAt ? 'Re-arm' : 'Resume'}
                                    </button>
                                    <button type="button" className="icon-btn" onClick={() => run(() => Alerts.remove(a.id))} aria-label={`Delete alert for ${a.symbol}`}>
                                        <FiTrash2 />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function NewAlertForm({ onCreated }) {
    const [params] = useSearchParams();
    const [form, setForm] = useState({
        assetType: params.get('type') === 'crypto' ? 'crypto' : 'stock',
        symbol: params.get('symbol') || '',
        condition: 'price_above',
        targetValue: '',
    });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e?.target ? e.target.value : e }));

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await Alerts.create({ ...form, symbol: form.symbol.trim() });
            setForm((f) => ({ ...f, targetValue: '' }));
            onCreated();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card title="New alert">
            <form className="form form-inline" onSubmit={submit}>
                <Segmented label="Asset type" value={form.assetType} onChange={set('assetType')} options={ASSET_OPTIONS} />
                <label>
                    Symbol
                    <input value={form.symbol} onChange={set('symbol')} required maxLength={20} placeholder={form.assetType === 'crypto' ? 'BTC' : 'AAPL'} autoCapitalize="characters" spellCheck="false" />
                </label>
                <label>
                    Condition
                    <select value={form.condition} onChange={set('condition')}>
                        {Object.entries(ALERT_CONDITIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <label>
                    {isPct(form.condition) ? 'Percent' : 'Price'}
                    <input type="number" inputMode="decimal" step="any" min={isPct(form.condition) ? undefined : '0'} value={form.targetValue} onChange={set('targetValue')} required />
                </label>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create alert'}</button>
            </form>
            <ErrorMessage error={error} />
        </Card>
    );
}
