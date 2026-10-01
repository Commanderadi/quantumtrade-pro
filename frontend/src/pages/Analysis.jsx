import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Market } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatMoney, formatNumber } from '../lib/format';
import { Card, EmptyState, ErrorMessage, Notice, Segmented, Spinner } from '../components/ui';
import SymbolSearch from '../components/SymbolSearch';

const RANGES = [
    { value: 30, label: '1M' },
    { value: 90, label: '3M' },
    { value: 0, label: 'All' },
];

const COLORS = { price: 'var(--accent)', sma20: '#f59e0b', sma50: '#a855f7', band: '#64748b', up: '#16a34a', down: '#dc2626', signal: '#f59e0b' };

export default function Analysis() {
    const { assetType, symbol } = useParams();
    const navigate = useNavigate();
    const valid = (assetType === 'stock' || assetType === 'crypto') && symbol;

    return (
        <div className="page">
            <div className="page-header">
                <h1>Technical analysis{valid ? `: ${symbol}` : ''}</h1>
            </div>
            <Card>
                <SymbolSearch
                    defaultAssetType={valid ? assetType : 'stock'}
                    onSelect={({ assetType: t, symbol: s }) => navigate(`/analysis/${t}/${encodeURIComponent(s)}`)}
                    submitLabel="Analyze"
                />
            </Card>
            {valid ? (
                <AnalysisCharts key={`${assetType}:${symbol}`} assetType={assetType} symbol={symbol.toUpperCase()} />
            ) : (
                <Card>
                    <EmptyState title="Choose a symbol">Search for a stock or cryptocurrency to see moving averages, RSI, MACD, Bollinger Bands and ATR computed from its daily price history.</EmptyState>
                </Card>
            )}
        </div>
    );
}

function AnalysisCharts({ assetType, symbol }) {
    const analysis = useAsync((signal) => Market.analysis(assetType, symbol, { signal }), [assetType, symbol]);
    const [range, setRange] = useState(90);

    const series = useMemo(() => {
        const all = analysis.data?.series ?? [];
        return range ? all.slice(-range) : all;
    }, [analysis.data, range]);

    if (analysis.loading) return <Spinner label={`Loading ${symbol} history…`} />;
    if (analysis.error) return <ErrorMessage error={analysis.error} onRetry={analysis.reload} />;
    const { summary, currency, source, approximateOhlc, disclaimer } = analysis.data;
    const money = (v) => formatMoney(v, currency);
    const last = series.at(-1);

    return (
        <>
            <Card title="Signal summary" actions={<span className={`pill pill-${summary.overall}`}>{summary.overall.replace('_', ' ')}</span>}>
                <ul className="signals">
                    {summary.signals.map((s) => (
                        <li key={s.indicator}>
                            <span className={`pill pill-${s.signal}`}>{s.signal}</span>
                            <strong>{s.indicator}</strong>
                            <span className="muted">{s.detail}</span>
                        </li>
                    ))}
                </ul>
                <p className="muted small">{disclaimer} Source: {source}, daily closes.</p>
            </Card>

            <div className="chart-toolbar">
                <Segmented label="Range" value={range} onChange={setRange} options={RANGES} />
                {last && <span className="muted small">Last close {money(last.close)} on {last.date}</span>}
            </div>

            <Card title="Price, moving averages & Bollinger Bands">
                <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={40} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={70} tickFormatter={(v) => formatNumber(v, { compact: v > 99999 })} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [money(v), name]} />
                        <Area type="monotone" dataKey="bbUpper" name="Upper band" stroke={COLORS.band} fill="none" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                        <Area type="monotone" dataKey="bbLower" name="Lower band" stroke={COLORS.band} fill="none" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="close" name="Close" stroke={COLORS.price} strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="sma20" name="SMA 20" stroke={COLORS.sma20} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="sma50" name="SMA 50" stroke={COLORS.sma50} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
                <Legend items={[['Close', COLORS.price], ['SMA 20', COLORS.sma20], ['SMA 50', COLORS.sma50], ['Bollinger (20, 2)', COLORS.band]]} />
            </Card>

            <div className="grid grid-2">
                <Card title="RSI (14)">
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={40} />
                            <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={40} />
                            <ReferenceLine y={70} stroke={COLORS.down} strokeDasharray="4 3" />
                            <ReferenceLine y={30} stroke={COLORS.up} strokeDasharray="4 3" />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatNumber(v)} />
                            <Line type="monotone" dataKey="rsi14" name="RSI" stroke={COLORS.price} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                    <p className="muted small">Above 70 is commonly read as overbought, below 30 as oversold.</p>
                </Card>

                <Card title="MACD (12, 26, 9)">
                    <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={40} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={60} tickFormatter={(v) => formatNumber(v)} />
                            <ReferenceLine y={0} stroke="var(--border-strong)" />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatNumber(v, { maxDigits: 4 })} />
                            <Bar dataKey="macdHistogram" name="Histogram" isAnimationActive={false}>
                                {series.map((d) => <Cell key={d.date} fill={d.macdHistogram >= 0 ? COLORS.up : COLORS.down} />)}
                            </Bar>
                            <Line type="monotone" dataKey="macd" name="MACD" stroke={COLORS.price} dot={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="macdSignal" name="Signal" stroke={COLORS.signal} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <Legend items={[['MACD', COLORS.price], ['Signal', COLORS.signal], ['Histogram', COLORS.up]]} />
                </Card>

                <Card title="Average True Range (14)">
                    {approximateOhlc && <Notice>Crypto history only includes daily closes, so ATR here measures close-to-close movement.</Notice>}
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={40} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={60} tickFormatter={(v) => formatNumber(v)} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                            <Line type="monotone" dataKey="atr14" name="ATR" stroke={COLORS.sma50} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </Card>

                <Card title="Volume">
                    <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={40} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={60} tickFormatter={(v) => formatNumber(v, { compact: true })} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatNumber(v, { compact: true })} />
                            <Bar dataKey="volume" name="Volume" isAnimationActive={false}>
                                {series.map((d) => <Cell key={d.date} fill={d.close >= d.open ? COLORS.up : COLORS.down} />)}
                            </Bar>
                        </ComposedChart>
                    </ResponsiveContainer>
                </Card>
            </div>
        </>
    );
}

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' };

function Legend({ items }) {
    return (
        <ul className="legend">
            {items.map(([label, color]) => (
                <li key={label}>
                    <span className="swatch" style={{ background: color }} aria-hidden="true" />
                    {label}
                </li>
            ))}
        </ul>
    );
}
