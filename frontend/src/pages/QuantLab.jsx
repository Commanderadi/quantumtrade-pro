import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Quant } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate, formatFraction, formatMoney, formatNumber, formatRatio, trendClass } from '../lib/format';
import { useCurrency } from '../context/CurrencyContext';
import { AssetBadge, Card, EmptyState, ErrorMessage, Notice, Segmented, Spinner, Stat, ASSET_OPTIONS } from '../components/ui';

const TABS = [
    { value: 'backtest', label: 'Backtest' },
    { value: 'risk', label: 'Portfolio risk' },
    { value: 'optimize', label: 'Optimizer' },
    { value: 'scan', label: 'Scanner' },
];

// Validated categorical pair (blue = strategy, orange = buy and hold); stepped per theme in styles.css.
const S1 = 'var(--series-1)';
const S2 = 'var(--series-2)';
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' };
const axisTick = { fontSize: 11, fill: 'var(--text-muted)' };

export default function QuantLab() {
    const [params, setParams] = useSearchParams();
    const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'backtest';
    return (
        <div className="page">
            <div className="page-header">
                <h1>Quant Lab</h1>
                <Segmented label="Tool" value={tab} onChange={(t) => setParams({ tab: t })} options={TABS} />
            </div>
            <p className="muted">
                Research tools used by systematic traders: honest backtests with costs and out-of-sample testing, portfolio risk, optimisation and a signal scanner.
                Historical results are not predictions.
            </p>
            {tab === 'backtest' && <BacktestPanel initial={params} />}
            {tab === 'risk' && <RiskPanel />}
            {tab === 'optimize' && <OptimizerPanel />}
            {tab === 'scan' && <ScannerPanel />}
        </div>
    );
}

// ------------------------------------------------------------------ backtest

const MODES = [
    { value: 'evaluate', label: 'Single test' },
    { value: 'optimize', label: 'Optimise' },
    { value: 'walk_forward', label: 'Walk-forward' },
];

const MODE_HELP = {
    evaluate: 'Runs your parameters once and compares the first 70% of history (in-sample) with the unseen last 30% (out-of-sample).',
    optimize: 'Searches a parameter grid on the in-sample period only, then shows how the winner did on data it never saw.',
    walk_forward: 'Re-optimises on a rolling window and trades the next unseen window each time. The most realistic test.',
};

function BacktestPanel({ initial }) {
    const meta = useAsync((signal) => Quant.strategies({ signal }), []);
    const [form, setForm] = useState({
        assetType: initial.get('type') === 'crypto' ? 'crypto' : 'stock',
        symbol: initial.get('symbol') || '',
        strategy: 'sma_cross',
        mode: 'evaluate',
        params: {},
        commissionBps: '',
        slippageBps: '',
        split: 70,
    });
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const strategies = meta.data?.strategies ?? [];
    const strategy = strategies.find((s) => s.id === form.strategy);
    const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value?.target ? value.target.value : value }));

    const run = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const params = Object.fromEntries(Object.entries(form.params).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
            const body = {
                assetType: form.assetType,
                symbol: form.symbol.trim(),
                strategy: form.strategy,
                mode: form.mode,
                split: Number(form.split) / 100,
                ...(form.mode === 'evaluate' && { params }),
                ...(form.commissionBps !== '' && { commissionBps: Number(form.commissionBps) }),
                ...(form.slippageBps !== '' && { slippageBps: Number(form.slippageBps) }),
            };
            setResult(await Quant.backtest(body));
        } catch (err) {
            setError(err);
            setResult(null);
        } finally {
            setBusy(false);
        }
    };

    if (meta.loading && !meta.data) return <Spinner />;
    if (meta.error) return <ErrorMessage error={meta.error} onRetry={meta.reload} />;

    return (
        <>
            <Card title="Strategy backtest">
                <form className="form form-grid" onSubmit={run}>
                    <div className="field-full quant-toolbar">
                        <Segmented label="Asset type" value={form.assetType} onChange={set('assetType')} options={ASSET_OPTIONS} />
                        <Segmented label="Test type" value={form.mode} onChange={set('mode')} options={MODES} />
                    </div>
                    <label>
                        Symbol
                        <input value={form.symbol} onChange={set('symbol')} required maxLength={20} placeholder={form.assetType === 'crypto' ? 'BTC' : 'AAPL or RELIANCE.BSE'} autoCapitalize="characters" spellCheck="false" />
                    </label>
                    <label>
                        Strategy
                        <select value={form.strategy} onChange={(e) => setForm((f) => ({ ...f, strategy: e.target.value, params: {} }))}>
                            {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </label>
                    {form.mode === 'evaluate' &&
                        strategy?.params.map((p) => (
                            <label key={p.key}>
                                {p.label}
                                <input
                                    type="number"
                                    min={p.min}
                                    max={p.max}
                                    step={p.integer ? 1 : p.step}
                                    placeholder={String(p.default)}
                                    value={form.params[p.key] ?? ''}
                                    onChange={(e) => setForm((f) => ({ ...f, params: { ...f.params, [p.key]: e.target.value } }))}
                                />
                            </label>
                        ))}
                    {form.mode !== 'walk_forward' && (
                        <label>
                            In-sample share (%)
                            <input type="number" min={50} max={90} value={form.split} onChange={set('split')} />
                        </label>
                    )}
                    <label>
                        Commission (bps per trade)
                        <input type="number" min={0} max={200} step="any" value={form.commissionBps} onChange={set('commissionBps')} placeholder={form.assetType === 'crypto' ? '10' : '5'} />
                    </label>
                    <label>
                        Slippage (bps per trade)
                        <input type="number" min={0} max={200} step="any" value={form.slippageBps} onChange={set('slippageBps')} placeholder={form.assetType === 'crypto' ? '10' : '5'} />
                    </label>
                    <p className="field-full muted small">
                        {strategy?.description} {MODE_HELP[form.mode]} Trades execute at the next day’s open; 1 bps = 0.01%.
                    </p>
                    <div className="field-full"><ErrorMessage error={error} /></div>
                    <div className="form-actions field-full">
                        <button type="submit" className="btn btn-primary" disabled={busy || !form.symbol.trim()}>{busy ? 'Running…' : 'Run backtest'}</button>
                    </div>
                </form>
            </Card>
            {busy && <Spinner label="Simulating…" />}
            {result && !busy && <BacktestResult result={result} />}
        </>
    );
}

const VERDICT_TEXT = {
    promising: 'Promising out of sample',
    inconclusive: 'Inconclusive',
    no_edge: 'No edge over buy-and-hold',
    baseline: 'Baseline',
};

function Verdict({ verdict }) {
    return (
        <div className={`verdict verdict-${verdict.rating}`} role="status">
            <strong>Verdict: {VERDICT_TEXT[verdict.rating]}</strong>
            <ul>{verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
    );
}

const METRIC_ROWS = [
    ['Total return', (m) => formatFraction(m.totalReturn, { signed: true })],
    ['Annual return (CAGR)', (m) => formatFraction(m.cagr, { signed: true })],
    ['Volatility (annual)', (m) => formatFraction(m.annualVol)],
    ['Sharpe ratio', (m) => formatRatio(m.sharpe)],
    ['Sortino ratio', (m) => formatRatio(m.sortino)],
    ['Max drawdown', (m) => formatFraction(m.maxDrawdown)],
    ['Calmar ratio', (m) => formatRatio(m.calmar)],
    ['t-statistic', (m) => formatRatio(m.tStat)],
    ['Days', (m) => m.bars],
];

function MetricsTable({ columns }) {
    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        {columns.map((c) => <th key={c.label} className="num">{c.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {METRIC_ROWS.map(([label, fn]) => (
                        <tr key={label}>
                            <td>{label}</td>
                            {columns.map((c) => <td key={c.label} className="num">{c.metrics ? fn(c.metrics) : '—'}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Legend({ items }) {
    return (
        <ul className="legend">
            {items.map(([label, color]) => (
                <li key={label}><span className="swatch" style={{ background: color }} aria-hidden="true" />{label}</li>
            ))}
        </ul>
    );
}

function EquityChart({ series, splitDate }) {
    const last = series.at(-1);
    return (
        <>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={series} margin={{ top: 8, right: 124, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} minTickGap={50} />
                    <YAxis tick={axisTick} width={56} tickFormatter={(v) => `${v.toFixed(2)}×`} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${Number(v).toFixed(3)}×`, name]} />
                    {splitDate && <ReferenceLine x={splitDate} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: 'out-of-sample →', position: 'insideTopLeft', fill: 'var(--text-muted)', fontSize: 11 }} />}
                    <Line type="monotone" dataKey="buyHold" name="Buy and hold" stroke={S2} strokeWidth={2} dot={false} isAnimationActive={false}
                        label={({ index, x, y }) => (index === series.length - 1 ? <text x={x + 6} y={y} dy={4} fill="var(--text-muted)" fontSize={11}>Buy & hold {last.buyHold.toFixed(2)}×</text> : null)} />
                    <Line type="monotone" dataKey="strategy" name="Strategy" stroke={S1} strokeWidth={2} dot={false} isAnimationActive={false}
                        label={({ index, x, y }) => (index === series.length - 1 ? <text x={x + 6} y={y} dy={4} fill="var(--text)" fontSize={11}>Strategy {last.strategy.toFixed(2)}×</text> : null)} />
                </LineChart>
            </ResponsiveContainer>
            <Legend items={[['Strategy', S1], ['Buy and hold', S2]]} />
        </>
    );
}

function DrawdownChart({ series }) {
    return (
        <>
            <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} minTickGap={50} />
                    <YAxis tick={axisTick} width={56} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [formatFraction(v), name]} />
                    <Area type="monotone" dataKey="buyHoldDrawdown" name="Buy and hold" stroke={S2} fill={S2} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
                    <Area type="monotone" dataKey="drawdown" name="Strategy" stroke={S1} fill={S1} fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
            <Legend items={[['Strategy', S1], ['Buy and hold', S2]]} />
        </>
    );
}

function BacktestResult({ result: r }) {
    const isWalk = r.mode === 'walk_forward';
    return (
        <>
            {r.note && <Notice tone="warning">{r.note}</Notice>}
            <Verdict verdict={r.verdict} />
            {r.warnings?.length > 0 && (
                <Notice tone="warning">
                    <ul className="plain-list">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                </Notice>
            )}

            <Card title={`${r.symbol} · ${isWalk ? 'walk-forward, stitched out-of-sample' : 'growth of 1'}`} actions={<span className="muted small">{r.source} · costs {r.costs.commissionBps}+{r.costs.slippageBps} bps</span>}>
                <EquityChart series={r.series} splitDate={isWalk ? null : r.period?.splitDate} />
                {!isWalk && <DrawdownChart series={r.series} />}
            </Card>

            <Card title="Performance">
                {isWalk ? (
                    <MetricsTable columns={[{ label: 'Strategy (out-of-sample)', metrics: r.outOfSample.metrics }, { label: 'Buy and hold (same days)', metrics: r.outOfSample.buyHold }]} />
                ) : (
                    <MetricsTable
                        columns={[
                            { label: 'Strategy (all)', metrics: r.full.metrics },
                            { label: 'Buy & hold (all)', metrics: r.buyHold },
                            { label: 'In-sample', metrics: r.inSample.metrics },
                            { label: 'Out-of-sample', metrics: r.outOfSample.metrics },
                            { label: 'Buy & hold (OOS)', metrics: r.outOfSample.buyHold },
                        ]}
                    />
                )}
                {!isWalk && (
                    <div className="stats">
                        <Stat label="Trades" value={r.full.trades.count} />
                        <Stat label="Win rate" value={formatFraction(r.full.trades.winRate, { dp: 0 })} />
                        <Stat label="Profit factor" value={formatRatio(r.full.trades.profitFactor)} />
                        <Stat label="Average trade" value={formatFraction(r.full.trades.avgReturn, { dp: 2, signed: true })} />
                        <Stat label="Average holding" value={r.full.trades.avgBars === null ? '—' : `${r.full.trades.avgBars} days`} />
                        <Stat label="Time in market" value={formatFraction(r.full.exposure, { dp: 0 })} />
                        <Stat label="Trading costs" value={formatFraction(r.full.costs.percentOfCapital, { dp: 2 })} sub="of starting capital" />
                    </div>
                )}
                <p className="muted small">
                    {formatDate(r.period?.from ?? r.folds?.[0]?.trainFrom)} – {formatDate(r.period?.to ?? r.folds?.at(-1)?.testTo)}. A t-statistic below 2 means the result could easily be luck. {r.disclaimer}
                </p>
            </Card>

            {r.optimization && (
                <Card title={`Parameter search (${r.optimization.trials} settings tested in-sample)`}>
                    <p className="muted small">
                        Best in-sample Sharpe {formatRatio(r.optimization.best.sharpe)}. Picking the best of {r.optimization.trials} random strategies would give about {formatRatio(r.optimization.luckSharpe)} by luck alone — the in-sample number should clearly beat that.
                    </p>
                    <ParamTable rows={r.optimization.ranking} />
                </Card>
            )}

            {isWalk && (
                <Card title={`Walk-forward folds (parameter stability ${formatFraction(r.parameterStability, { dp: 0 })})`}>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr><th>Trained on</th><th>Traded</th><th>Chosen parameters</th><th className="num">In-sample Sharpe</th><th className="num">Strategy</th><th className="num">Buy & hold</th><th className="num">Trades</th></tr>
                            </thead>
                            <tbody>
                                {r.folds.map((f) => (
                                    <tr key={f.testFrom}>
                                        <td className="small">{f.trainFrom} → {f.trainTo}</td>
                                        <td className="small">{f.testFrom} → {f.testTo}</td>
                                        <td className="small">{paramText(f.params)}</td>
                                        <td className="num">{formatRatio(f.inSampleSharpe)}</td>
                                        <td className={`num ${trendClass(f.outOfSampleReturn)}`}>{formatFraction(f.outOfSampleReturn, { signed: true })}</td>
                                        <td className={`num ${trendClass(f.buyHoldReturn)}`}>{formatFraction(f.buyHoldReturn, { signed: true })}</td>
                                        <td className="num">{f.trades}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {!isWalk && r.trades.length > 0 && (
                <Card title={`Trades (last ${r.trades.length})`}>
                    <div className="table-wrap">
                        <table className="table">
                            <thead><tr><th>Entry</th><th>Exit</th><th className="num">Entry price</th><th className="num">Exit price</th><th className="num">Days</th><th className="num">Return</th></tr></thead>
                            <tbody>
                                {[...r.trades].reverse().map((t) => (
                                    <tr key={`${t.entryDate}-${t.exitDate}`}>
                                        <td>{t.entryDate}</td>
                                        <td>{t.exitDate}{t.open ? ' (open)' : ''}</td>
                                        <td className="num">{formatMoney(t.entryPrice, r.currency)}</td>
                                        <td className="num">{formatMoney(t.exitPrice, r.currency)}</td>
                                        <td className="num">{t.bars}</td>
                                        <td className={`num ${trendClass(t.return)}`}>{formatFraction(t.return, { dp: 2, signed: true })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </>
    );
}

const paramText = (p) => Object.entries(p).map(([k, v]) => `${k} ${v}`).join(', ') || '—';

function ParamTable({ rows }) {
    return (
        <div className="table-wrap">
            <table className="table">
                <thead><tr><th>Parameters</th><th className="num">Sharpe</th><th className="num">Return</th><th className="num">Max drawdown</th><th className="num">Trades</th></tr></thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={paramText(r.params)} className={i === 0 ? 'row-highlight' : ''}>
                            <td>{paramText(r.params)}</td>
                            <td className="num">{formatRatio(r.sharpe)}</td>
                            <td className={`num ${trendClass(r.totalReturn)}`}>{formatFraction(r.totalReturn, { signed: true })}</td>
                            <td className="num">{formatFraction(r.maxDrawdown)}</td>
                            <td className="num">{r.trades}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ---------------------------------------------------------------------- risk

const displayCurrency = (apiCurrency) => apiCurrency ?? 'USD';

function RiskPanel() {
    const { apiCurrency } = useCurrency();
    const currency = displayCurrency(apiCurrency);
    const [benchmark, setBenchmark] = useState('SPY');
    const [state, setState] = useState({ data: null, error: null, loading: false });

    const run = async (e) => {
        e?.preventDefault();
        setState({ data: null, error: null, loading: true });
        try {
            setState({ data: await Quant.risk({ currency, benchmark: benchmark.trim() || undefined }), error: null, loading: false });
        } catch (err) {
            setState({ data: null, error: err, loading: false });
        }
    };
    const r = state.data;

    return (
        <>
            <Card title="Portfolio risk">
                <form className="form form-inline" onSubmit={run}>
                    <label>
                        Benchmark (for beta, optional)
                        <input value={benchmark} onChange={(e) => setBenchmark(e.target.value)} maxLength={20} placeholder="SPY" autoCapitalize="characters" />
                    </label>
                    <button type="submit" className="btn btn-primary" disabled={state.loading}>{state.loading ? 'Analysing…' : 'Analyse my portfolio'}</button>
                </form>
                <p className="muted small">Uses the daily price history of every open position (one data request each). Values in {currency}; change it on the Dashboard or in Settings.</p>
                <ErrorMessage error={state.error} />
            </Card>
            {state.loading && <Spinner label="Loading price histories…" />}
            {r && (
                <>
                    <Card title={`Risk summary · ${formatDate(r.period.from)} – ${formatDate(r.period.to)}`}>
                        <div className="stats">
                            <Stat label="Portfolio value" value={formatMoney(r.totalValue, r.currency)} />
                            <Stat label="Volatility (annual)" value={formatFraction(r.annualVol)} />
                            <Stat label="1-day VaR 95%" value={formatMoney(r.var95 * r.totalValue, r.currency)} sub={`${formatFraction(r.var95, { dp: 2 })} — a loss exceeded on ~1 day in 20`} />
                            <Stat label="Expected shortfall 95%" value={formatMoney(r.cvar95 * r.totalValue, r.currency)} sub="average loss on those worst days" />
                            <Stat label="Max drawdown (history)" value={formatFraction(r.maxDrawdown)} />
                            <Stat label="Sharpe (history)" value={formatRatio(r.sharpe)} />
                            <Stat label={`Beta vs ${r.benchmark ?? 'benchmark'}`} value={formatRatio(r.beta)} />
                            <Stat label="Effective independent bets" value={formatRatio(r.effectiveBets, 1)} sub={`of ${r.assets.length} positions`} />
                        </div>
                    </Card>
                    <Card title="Where your risk comes from">
                        <div className="table-wrap">
                            <table className="table">
                                <thead><tr><th>Asset</th><th className="num">Weight</th><th className="num">Volatility</th><th>Share of portfolio risk</th></tr></thead>
                                <tbody>
                                    {[...r.assets].sort((a, b) => b.riskShare - a.riskShare).map((a) => (
                                        <tr key={a.symbol}>
                                            <td className="symbol-link">{a.symbol}</td>
                                            <td className="num">{formatFraction(a.weight)}</td>
                                            <td className="num">{formatFraction(a.annualVol)}</td>
                                            <td><ShareBar value={a.riskShare} compare={a.weight} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="muted small">When an asset’s share of risk is much larger than its weight, it dominates your portfolio’s swings.</p>
                    </Card>
                    {r.assets.length > 1 && (
                        <Card title="Correlation (daily returns)">
                            <CorrelationTable symbols={r.correlation.symbols} matrix={r.correlation.matrix} />
                        </Card>
                    )}
                    <Card title="Worst days for this portfolio mix">
                        <ul className="plain-list">
                            {r.worstDays.map((d) => <li key={d.date}>{formatDate(d.date)}: <span className="down">{formatFraction(d.return, { dp: 2 })}</span> ({formatMoney(d.return * r.totalValue, r.currency)})</li>)}
                        </ul>
                    </Card>
                    <SkippedAndNotes skipped={r.skipped} notes={r.notes} />
                </>
            )}
        </>
    );
}

function ShareBar({ value, compare }) {
    return (
        <div className="sharebar" title={`Risk share ${formatFraction(value)} vs weight ${formatFraction(compare)}`}>
            <div className="sharebar-track">
                <div className="sharebar-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
                <div className="sharebar-marker" style={{ left: `${Math.max(0, Math.min(1, compare)) * 100}%` }} aria-hidden="true" />
            </div>
            <span className="sharebar-label">{formatFraction(value)}</span>
        </div>
    );
}

function CorrelationTable({ symbols, matrix }) {
    const cellStyle = (v) => {
        const pole = v >= 0 ? 'var(--div-pos)' : 'var(--div-neg)';
        const pct = Math.round(Math.min(1, Math.abs(v)) * 55);
        return { background: `color-mix(in oklab, ${pole} ${pct}%, var(--div-mid))` };
    };
    return (
        <>
            <div className="table-wrap">
                <table className="table corr-table">
                    <thead><tr><th aria-label="Asset" />{symbols.map((s) => <th key={s} className="num">{s}</th>)}</tr></thead>
                    <tbody>
                        {symbols.map((row, i) => (
                            <tr key={row}>
                                <th scope="row">{row}</th>
                                {matrix[i].map((v, j) => <td key={symbols[j]} className="num corr-cell" style={cellStyle(v)} title={`${row} vs ${symbols[j]}: ${v.toFixed(2)}`}>{v.toFixed(2)}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="muted small">1 = move together, 0 = unrelated, −1 = move opposite. Blue cells are positive, red cells negative. Low correlations diversify.</p>
        </>
    );
}

function SkippedAndNotes({ skipped, notes }) {
    return (
        <>
            {skipped?.length > 0 && (
                <Notice tone="warning">
                    Left out: {skipped.map((s) => `${s.symbol} (${s.reason ?? s.error})`).join('; ')}
                </Notice>
            )}
            {notes?.length > 0 && <ul className="plain-list muted small">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </>
    );
}

// ----------------------------------------------------------------- optimizer

function OptimizerPanel() {
    const { apiCurrency } = useCurrency();
    const currency = displayCurrency(apiCurrency);
    const meta = useAsync((signal) => Quant.strategies({ signal }), []);
    const [form, setForm] = useState({ method: 'risk_parity', maxWeight: 40, include: 'holdings' });
    const [state, setState] = useState({ data: null, error: null, loading: false });

    const run = async (e) => {
        e.preventDefault();
        setState({ data: null, error: null, loading: true });
        try {
            const data = await Quant.optimize({ method: form.method, maxWeight: Number(form.maxWeight) / 100, include: form.include, currency });
            setState({ data, error: null, loading: false });
        } catch (err) {
            setState({ data: null, error: err, loading: false });
        }
    };
    const r = state.data;

    return (
        <>
            <Card title="Portfolio optimizer">
                <form className="form form-inline" onSubmit={run}>
                    <label>
                        Method
                        <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                            {(meta.data?.optimizers ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                    </label>
                    <label>
                        Max weight per asset (%)
                        <input type="number" min={5} max={100} value={form.maxWeight} onChange={(e) => setForm((f) => ({ ...f, maxWeight: e.target.value }))} />
                    </label>
                    <label>
                        Assets
                        <select value={form.include} onChange={(e) => setForm((f) => ({ ...f, include: e.target.value }))}>
                            <option value="holdings">My holdings</option>
                            <option value="watchlist">Holdings + watchlist</option>
                        </select>
                    </label>
                    <button type="submit" className="btn btn-primary" disabled={state.loading}>{state.loading ? 'Optimising…' : 'Optimise'}</button>
                </form>
                <p className="muted small">
                    Risk parity balances how much risk each asset contributes and is the most robust choice. Maximum Sharpe relies on expected returns, which are hard to estimate — it is shown with shrunk estimates and a weight cap.
                </p>
                <ErrorMessage error={state.error} />
            </Card>
            {state.loading && <Spinner label="Loading price histories…" />}
            {r && (
                <>
                    <Card title={`${r.label} · based on ${r.period.days} days`}>
                        <div className="stats">
                            <Stat label="Expected volatility" value={formatFraction(r.expected.vol)} />
                            <Stat label="Historical return (shrunk)" value={formatFraction(r.expected.return, { signed: true })} />
                            <Stat label="Sharpe (estimate)" value={formatRatio(r.expected.sharpe)} />
                            {r.totalValue > 0 && <Stat label="Portfolio value" value={formatMoney(r.totalValue, r.currency)} />}
                        </div>
                        <div className="table-wrap">
                            <table className="table">
                                <thead><tr><th>Asset</th><th className="num">Current</th><th>Suggested</th><th className="num">Risk share</th>{r.totalValue > 0 && <th className="num">Change</th>}</tr></thead>
                                <tbody>
                                    {r.assets.map((a) => (
                                        <tr key={`${a.assetType}:${a.symbol}`}>
                                            <td>{a.symbol} <AssetBadge type={a.assetType} />{!a.inPortfolio && <span className="muted small"> (watchlist)</span>}</td>
                                            <td className="num">{formatFraction(a.currentWeight)}</td>
                                            <td><ShareBar value={a.targetWeight} compare={a.currentWeight} /></td>
                                            <td className="num">{formatFraction(a.riskShare)}</td>
                                            {r.totalValue > 0 && <td className={`num ${trendClass(a.changeValue)}`}>{a.changeValue === null ? '—' : `${a.changeValue > 0 ? 'Buy ' : a.changeValue < 0 ? 'Sell ' : ''}${formatMoney(Math.abs(a.changeValue), r.currency)}`}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="muted small">The bar shows the suggested weight; the tick marks your current weight.</p>
                    </Card>
                    <SkippedAndNotes skipped={r.skipped} notes={r.notes} />
                </>
            )}
        </>
    );
}

// ------------------------------------------------------------------- scanner

function ScannerPanel() {
    const [state, setState] = useState({ data: null, error: null, loading: false });
    const run = async () => {
        setState({ data: null, error: null, loading: true });
        try {
            setState({ data: await Quant.scan({ limit: 15 }), error: null, loading: false });
        } catch (err) {
            setState({ data: null, error: err, loading: false });
        }
    };
    const rows = state.data?.assets ?? [];

    return (
        <>
            <Card title="Signal scanner" actions={<button type="button" className="btn btn-primary" onClick={run} disabled={state.loading}>{state.loading ? 'Scanning…' : 'Scan watchlist & holdings'}</button>}>
                <p className="muted small">Momentum, trend and volatility for up to 15 of your assets (one data request each). The score ranks assets by recent strength; it is a description, not a forecast.</p>
                <ErrorMessage error={state.error} />
                {state.loading && <Spinner label="Loading price histories…" />}
                {!state.loading && !state.data && !state.error && <EmptyState title="Run a scan to rank your assets" />}
                {rows.length > 0 && (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Asset</th><th className="num">Score</th><th className="num">1M</th><th className="num">3M</th><th className="num">6M</th><th className="num hide-sm">12M</th>
                                    <th className="num hide-sm">Vol</th><th className="num">RSI</th><th className="num">Trend</th><th className="num hide-sm">From high</th><th aria-label="Actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((a) => (
                                    <tr key={`${a.assetType}:${a.symbol}`}>
                                        <td><span className="symbol-link">{a.symbol}</span> <AssetBadge type={a.assetType} />{a.held && <span className="muted small"> held</span>}</td>
                                        <td className="num"><strong>{a.score ?? '—'}</strong></td>
                                        {['return1m', 'return3m', 'return6m'].map((k) => <td key={k} className={`num ${trendClass(a[k])}`}>{formatFraction(a[k], { signed: true })}</td>)}
                                        <td className={`num hide-sm ${trendClass(a.return12m)}`}>{formatFraction(a.return12m, { signed: true })}</td>
                                        <td className="num hide-sm">{formatFraction(a.vol60, { dp: 0 })}</td>
                                        <td className="num">{formatNumber(a.rsi14, { maxDigits: 0 })}</td>
                                        <td className="num" title={a.states.map((s) => `${s.name}: ${s.long ? 'long' : 'flat'}`).join('\n')}>{a.trendVotes}/{a.trendVotesTotal}</td>
                                        <td className="num hide-sm">{formatFraction(a.drawdownFromHigh, { dp: 0 })}</td>
                                        <td className="actions">
                                            <Link className="btn btn-small" to={`/quant?tab=backtest&type=${a.assetType}&symbol=${encodeURIComponent(a.symbol)}`}>Backtest</Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {state.data?.failed?.length > 0 && <Notice tone="warning">Could not load: {state.data.failed.map((f) => `${f.symbol} (${f.error})`).join('; ')}</Notice>}
                {state.data && <p className="muted small">Trend = how many of the {rows[0]?.trendVotesTotal ?? 4} trend strategies are currently long. {state.data.note}</p>}
            </Card>
        </>
    );
}
