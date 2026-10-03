import { useState } from 'react';
import { Coach } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate, formatFraction, formatMoney, formatQuantity, formatSignedMoney, trendClass } from '../lib/format';
import { AssetBadge, Card, EmptyState, ErrorMessage, Notice, Segmented, Spinner, Stat, ASSET_OPTIONS } from '../components/ui';

export const REASONS = [
    { value: 'research', label: 'My own research' },
    { value: 'chart', label: 'Chart / technical signal' },
    { value: 'news', label: 'News' },
    { value: 'tip', label: 'Tip from someone' },
    { value: 'gut', label: 'Gut feeling' },
    { value: 'rebalance', label: 'Rebalancing' },
    { value: 'take_profit', label: 'Taking profit' },
    { value: 'stop_loss', label: 'Cutting a loss' },
    { value: 'other', label: 'Other' },
];
const reasonLabel = (r) => REASONS.find((x) => x.value === r)?.label ?? r;

export default function CoachPage() {
    const account = useAsync((signal) => Coach.account({ signal }), []);
    const insights = useAsync((signal) => Coach.insights({ signal }), []);
    const trades = useAsync((signal) => Coach.trades(50, { signal }), []);
    const refresh = () => {
        account.reload();
        insights.reload();
        trades.reload();
    };

    return (
        <div className="page">
            <div className="page-header">
                <h1>Practice Coach</h1>
                {account.data && <ResetButton currency={account.data.account.currency} onDone={refresh} />}
            </div>
            <p className="muted">
                Practise investing with pretend money at real prices. Say why you make every trade, and the Coach shows which habits help or hurt you,
                and how you compare with simply buying the index. No real money is ever used.
            </p>

            {account.loading && !account.data ? (
                <Spinner />
            ) : account.error ? (
                <ErrorMessage error={account.error} onRetry={account.reload} />
            ) : (
                <>
                    <Scoreboard data={account.data} />
                    <OrderTicket currency={account.data.account.currency} positions={account.data.positions} feeBps={account.data.account.feeBps} onDone={refresh} />
                    <Positions data={account.data} />
                </>
            )}

            <InsightsPanel state={insights} currency={account.data?.account.currency ?? 'INR'} />
            <Journal state={trades} currency={account.data?.account.currency ?? 'INR'} />
            <LessonLibrary />
        </div>
    );
}

function Scoreboard({ data }) {
    const { account: a, mirror: m } = data;
    const gap = m.value === null ? null : a.totalValue - m.value;
    return (
        <Card title="Your practice account">
            <div className="stats">
                <Stat label="Account value" value={formatMoney(a.totalValue, a.currency)} sub={`started with ${formatMoney(a.startingCash, a.currency)}`} />
                <Stat label="Your return" value={formatSignedMoney(a.totalReturn, a.currency)} sub={formatFraction(a.totalReturnPct, { signed: true })} tone={a.totalReturn} />
                <Stat label="Cash available" value={formatMoney(a.cash, a.currency)} />
                <Stat label={`If you had bought the ${m.label} instead`} value={m.value === null ? '—' : formatMoney(m.value, a.currency)} sub={m.returnPct === null ? 'price unavailable' : formatFraction(m.returnPct, { signed: true })} />
                <Stat label="Trades / costs paid" value={`${a.tradeCount}`} sub={`${formatMoney(a.feesPaid, a.currency)} in costs`} />
            </div>
            {gap !== null && a.tradeCount > 0 && (
                <p className={`mirror-verdict ${gap >= 0 ? 'up' : 'down'}`}>
                    {gap >= 0
                        ? `You are ${formatMoney(gap, a.currency)} ahead of the ${m.label}.`
                        : `The ${m.label} is ${formatMoney(-gap, a.currency)} ahead of you.`}{' '}
                    <span className="muted">Same money, same dates, invested in the index.</span>
                </p>
            )}
            {!m.available && <p className="muted small">The {m.label} price ({m.symbol}) isn’t available on your data plan, so the index comparison can’t be calculated.</p>}
            {m.available && !m.complete && <p className="muted small">The index price was unavailable for some trades, so the comparison is approximate.</p>}
        </Card>
    );
}

function OrderTicket({ currency, positions, feeBps, onDone }) {
    const [form, setForm] = useState({ assetType: 'stock', symbol: '', side: 'buy', by: 'amount', amount: '', quantity: '', all: false, reason: '', confidence: '', note: '' });
    const [state, setState] = useState({ busy: false, error: null, done: null });
    const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
    const held = positions.find((p) => p.symbol === form.symbol.trim().toUpperCase() && p.assetType === form.assetType);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.reason) return setState({ busy: false, error: 'Choose why you are making this trade — that is how the Coach learns your habits.', done: null });
        setState({ busy: true, error: null, done: null });
        try {
            const body = {
                assetType: form.assetType,
                symbol: form.symbol.trim(),
                side: form.side,
                reason: form.reason,
                ...(form.note.trim() && { note: form.note.trim() }),
                ...(form.confidence && { confidence: Number(form.confidence) }),
            };
            if (form.side === 'sell' && form.all) body.all = true;
            else if (form.side === 'buy' && form.by === 'amount') body.amount = Number(form.amount);
            else body.quantity = Number(form.quantity);
            const result = await Coach.order(body);
            setState({ busy: false, error: null, done: result });
            setForm((f) => ({ ...f, amount: '', quantity: '', all: false, reason: '', confidence: '', note: '' }));
            onDone();
        } catch (err) {
            setState({ busy: false, error: err, done: null });
        }
    };

    const t = state.done?.trade;
    return (
        <Card title="Place a practice order">
            <form className="form form-grid" onSubmit={submit}>
                <div className="field-full quant-toolbar">
                    <Segmented label="Asset type" value={form.assetType} onChange={set('assetType')} options={ASSET_OPTIONS} />
                    <Segmented label="Buy or sell" value={form.side} onChange={set('side')} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
                </div>
                <label>
                    Symbol
                    <input value={form.symbol} onChange={set('symbol')} required maxLength={20} placeholder={form.assetType === 'crypto' ? 'BTC' : 'AAPL or RELIANCE.BSE'} autoCapitalize="characters" spellCheck="false" />
                    {held && <span className="hint">You hold {formatQuantity(String(held.quantity))}.</span>}
                </label>
                {form.side === 'buy' ? (
                    <>
                        <label>
                            Buy by
                            <select value={form.by} onChange={set('by')}>
                                <option value="amount">Amount ({currency})</option>
                                <option value="quantity">Quantity</option>
                            </select>
                        </label>
                        {form.by === 'amount' ? (
                            <label>
                                Amount to invest ({currency})
                                <input type="number" min="1" step="any" value={form.amount} onChange={set('amount')} required placeholder="10000" />
                            </label>
                        ) : (
                            <label>
                                Quantity
                                <input type="number" min="0" step="any" value={form.quantity} onChange={set('quantity')} required />
                            </label>
                        )}
                    </>
                ) : (
                    <>
                        <label>
                            Quantity
                            <input type="number" min="0" step="any" value={form.quantity} onChange={set('quantity')} required={!form.all} disabled={form.all} />
                        </label>
                        <label className="checkbox">
                            <input type="checkbox" checked={form.all} onChange={set('all')} /> Sell everything I hold
                        </label>
                    </>
                )}
                <fieldset className="field-full reason-picker">
                    <legend>Why are you making this trade?</legend>
                    <div className="chips">
                        {REASONS.map((r) => (
                            <label key={r.value} className={`chip ${form.reason === r.value ? 'active' : ''}`}>
                                <input type="radio" name="reason" value={r.value} checked={form.reason === r.value} onChange={set('reason')} />
                                {r.label}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <label>
                    How sure are you? (optional)
                    <select value={form.confidence} onChange={set('confidence')}>
                        <option value="">—</option>
                        <option value="1">1 – just guessing</option>
                        <option value="2">2</option>
                        <option value="3">3 – fairly sure</option>
                        <option value="4">4</option>
                        <option value="5">5 – very sure</option>
                    </select>
                </label>
                <label className="field-full">
                    Your thinking (optional)
                    <input value={form.note} onChange={set('note')} maxLength={500} placeholder="e.g. strong quarterly results, I plan to hold for a year" />
                </label>
                <div className="field-full"><ErrorMessage error={state.error} /></div>
                {t && (
                    <div className="field-full">
                        <Notice tone="success">
                            {t.side === 'buy' ? 'Bought' : 'Sold'} {formatQuantity(t.quantity)} {t.symbol} at {formatMoney(t.price, t.priceCurrency)} — {formatMoney(t.grossAmount, currency)} plus {formatMoney(t.fee, currency)} costs.
                            {t.realizedPnl !== null && <> Result: <strong className={trendClass(t.realizedPnl)}>{formatSignedMoney(t.realizedPnl, currency)}</strong>.</>}
                            {state.done.note && <> {state.done.note}</>}
                        </Notice>
                    </div>
                )}
                <div className="form-actions field-full">
                    <span className="muted small">Fills at the latest price with about {(feeBps / 100).toFixed(2)}% for brokerage and charges.</span>
                    <button type="submit" className="btn btn-primary" disabled={state.busy}>{state.busy ? 'Placing…' : `Place practice ${form.side}`}</button>
                </div>
            </form>
        </Card>
    );
}

function Positions({ data }) {
    const { positions, account } = data;
    return (
        <Card title="Your practice holdings">
            {positions.length === 0 ? (
                <EmptyState title="No holdings yet">Place your first practice order above. A good first exercise: buy a Nifty 50 ETF or a large company you understand, and write down why.</EmptyState>
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr><th>Asset</th><th className="num">Quantity</th><th className="num">Avg cost</th><th className="num">Price</th><th className="num">Value</th><th className="num">Profit / loss</th><th className="num hide-sm">Weight</th></tr>
                        </thead>
                        <tbody>
                            {positions.map((p) => (
                                <tr key={`${p.assetType}:${p.symbol}`}>
                                    <td><span className="symbol-link">{p.symbol}</span> <AssetBadge type={p.assetType} /></td>
                                    <td className="num">{formatQuantity(String(p.quantity))}</td>
                                    <td className="num">{formatMoney(p.avgCost, account.currency)}</td>
                                    <td className="num">{p.price === null ? <span className="muted small" title={p.quoteError}>unavailable</span> : formatMoney(p.price, p.priceCurrency)}</td>
                                    <td className="num">{formatMoney(p.value, account.currency)}</td>
                                    <td className={`num ${trendClass(p.pnl)}`}>{p.pnl === null ? '—' : <>{formatSignedMoney(p.pnl, account.currency)}<br /><span className="small">{formatFraction(p.pnlPct, { signed: true })}</span></>}</td>
                                    <td className="num hide-sm">{formatFraction(p.weight, { dp: 0 })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function InsightsPanel({ state, currency }) {
    if (state.loading && !state.data) return <Spinner label="Reviewing your habits…" />;
    if (state.error) return <ErrorMessage error={state.error} onRetry={state.reload} />;
    const { behaviours, reasons, lessons } = state.data;
    const lessonById = new Map(lessons.map((l) => [l.id, l]));
    return (
        <>
            <Card title="What the Coach noticed">
                {behaviours.length === 0 ? (
                    <EmptyState title="Nothing to report yet">After about five trades the Coach starts pointing out patterns in what you do.</EmptyState>
                ) : (
                    <ul className="insights">
                        {behaviours.map((b) => (
                            <li key={b.id} className={`insight insight-${b.severity}`}>
                                <strong>{b.title}</strong>
                                <span>{b.detail}</span>
                                {lessonById.get(b.lesson) && <LessonDetails lesson={lessonById.get(b.lesson)} summary="Why this matters" />}
                            </li>
                        ))}
                    </ul>
                )}
                {lessonById.get('start_here') && <LessonDetails lesson={lessonById.get('start_here')} summary="New here? Start with this" open />}
            </Card>
            <Card title="Why you traded — and how it worked out">
                {reasons.length === 0 ? (
                    <EmptyState title="No trades yet" />
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead><tr><th>Reason for buying</th><th className="num">Buys</th><th className="num">Closed</th><th className="num">Win rate</th><th className="num">Profit / loss</th><th className="num hide-sm">On money invested</th></tr></thead>
                            <tbody>
                                {reasons.map((r) => (
                                    <tr key={r.reason}>
                                        <td>{reasonLabel(r.reason)}</td>
                                        <td className="num">{r.lots}</td>
                                        <td className="num">{r.closedLots}</td>
                                        <td className="num">{formatFraction(r.winRate, { dp: 0 })}</td>
                                        <td className={`num ${trendClass(r.totalPnl)}`}>{formatSignedMoney(r.totalPnl, currency)}</td>
                                        <td className={`num hide-sm ${trendClass(r.returnOnInvested)}`}>{formatFraction(r.returnOnInvested, { signed: true })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="muted small">Includes open positions at today’s prices. A few trades prove little — look for patterns over dozens.</p>
            </Card>
        </>
    );
}

function Journal({ state, currency }) {
    if (state.loading && !state.data) return null;
    if (state.error) return <ErrorMessage error={state.error} onRetry={state.reload} />;
    const trades = state.data.trades;
    if (!trades.length) return null;
    return (
        <Card title="Your trade journal">
            <div className="table-wrap">
                <table className="table">
                    <thead><tr><th>Date</th><th>Trade</th><th>Why</th><th className="hide-sm">Your thinking</th><th className="num">Amount</th><th className="num">Result</th></tr></thead>
                    <tbody>
                        {trades.map((t) => (
                            <tr key={t.id}>
                                <td className="small">{formatDate(t.executedAt, { time: true })}</td>
                                <td><span className={`side side-${t.side}`}>{t.side}</span> {formatQuantity(t.quantity)} {t.symbol}</td>
                                <td>{reasonLabel(t.reason)}{t.confidence ? <span className="muted small"> · {t.confidence}/5</span> : null}</td>
                                <td className="hide-sm muted small">{t.note || '—'}</td>
                                <td className="num">{formatMoney(t.grossAmount, currency)}</td>
                                <td className={`num ${trendClass(t.realizedPnl)}`}>{t.realizedPnl === null ? '—' : formatSignedMoney(t.realizedPnl, currency)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function LessonDetails({ lesson, summary, open = false }) {
    return (
        <details className="lesson" open={open}>
            <summary>{summary ?? lesson.title}</summary>
            {summary && <p className="lesson-title">{lesson.title}</p>}
            {lesson.body.map((p) => <p key={p}>{p}</p>)}
        </details>
    );
}

function LessonLibrary() {
    const lessons = useAsync((signal) => Coach.lessons({ signal }), []);
    if (!lessons.data) return null;
    return (
        <Card title="Lessons">
            {lessons.data.lessons.map((l) => <LessonDetails key={l.id} lesson={l} />)}
        </Card>
    );
}

function ResetButton({ currency, onDone }) {
    const [error, setError] = useState(null);
    const reset = async () => {
        const choice = window.prompt('Start over with a fresh practice account? All practice trades will be deleted.\nType INR or USD for the account currency:', currency);
        if (choice === null) return;
        const cur = choice.trim().toUpperCase();
        if (!['INR', 'USD'].includes(cur)) return setError('Please type INR or USD.');
        try {
            await Coach.reset(cur);
            setError(null);
            onDone();
        } catch (err) {
            setError(err);
        }
    };
    return (
        <div className="reset-wrap">
            <button type="button" className="btn btn-small" onClick={reset}>Start over</button>
            {error && <ErrorMessage error={error} />}
        </div>
    );
}
