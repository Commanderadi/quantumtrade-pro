import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FiBarChart2, FiBell, FiStar } from 'react-icons/fi';
import { Market, Watchlist } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { Card, Change, ErrorMessage, Notice, Spinner, Stat } from '../components/ui';
import SymbolSearch from '../components/SymbolSearch';

export default function Markets() {
    const [params, setParams] = useSearchParams();
    const assetType = params.get('type') === 'crypto' ? 'crypto' : 'stock';
    const symbol = params.get('symbol') || '';
    const top = useAsync((signal) => Market.topCryptos(25, { signal }), []);

    return (
        <div className="page">
            <div className="page-header">
                <h1>Markets</h1>
            </div>
            <Card>
                <SymbolSearch
                    assetType={assetType}
                    onAssetTypeChange={(t) => setParams({ type: t })}
                    onSelect={({ assetType: t, symbol: s }) => setParams({ type: t, symbol: s })}
                    submitLabel="Look up"
                />
            </Card>

            {symbol && <QuoteDetails key={`${assetType}:${symbol}`} assetType={assetType} symbol={symbol} />}

            <Card title="Top 25 cryptocurrencies by market cap">
                {top.loading && !top.data ? (
                    <Spinner />
                ) : top.error ? (
                    <ErrorMessage error={top.error} onRetry={top.reload} />
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="num">#</th>
                                    <th>Name</th>
                                    <th className="num">Price</th>
                                    <th className="num">24h</th>
                                    <th className="num hide-sm">Market cap</th>
                                    <th className="num hide-sm">Volume (24h)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {top.data.coins.map((c) => (
                                    <tr key={c.coinId}>
                                        <td className="num muted">{c.rank}</td>
                                        <td>
                                            <Link className="coin-cell" to={`/markets?type=crypto&symbol=${encodeURIComponent(c.symbol)}`}>
                                                {c.image && <img src={c.image} alt="" width="20" height="20" loading="lazy" />}
                                                {c.name} <span className="muted">{c.symbol}</span>
                                            </Link>
                                        </td>
                                        <td className="num">{formatMoney(c.price)}</td>
                                        <td className="num"><Change value={c.changePercent} /></td>
                                        <td className="num hide-sm">{formatMoney(c.marketCap, 'USD', { compact: true })}</td>
                                        <td className="num hide-sm">{formatMoney(c.volume, 'USD', { compact: true })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}

function QuoteDetails({ assetType, symbol }) {
    const quote = useAsync((signal) => Market.quote(assetType, symbol, { signal }), [assetType, symbol]);
    const info = useAsync((signal) => Market.cryptoInfo(symbol, { signal }), [symbol], { enabled: assetType === 'crypto' });
    const [msg, setMsg] = useState(null);

    const addToWatchlist = async () => {
        setMsg(null);
        try {
            await Watchlist.add(assetType, shownSymbol);
            setMsg({ tone: 'success', text: `${shownSymbol} added to your watchlist.` });
        } catch (err) {
            setMsg({ tone: 'error', text: err.message });
        }
    };

    if (quote.loading) return <Spinner label={`Loading ${symbol}…`} />;
    if (quote.error) return <ErrorMessage error={quote.error} onRetry={quote.reload} />;
    const q = quote.data.quote;
    const i = info.data?.info;
    const shownSymbol = q.symbol ?? symbol;

    return (
        <Card
            title={
                <>
                    {i?.image && <img src={i.image} alt="" width="24" height="24" className="title-icon" />}
                    {i?.name ? `${i.name} (${shownSymbol})` : shownSymbol}
                </>
            }
            actions={
                <>
                    <button type="button" className="btn btn-small" onClick={addToWatchlist}><FiStar aria-hidden="true" /> Watch</button>
                    <Link className="btn btn-small" to={`/alerts?type=${assetType}&symbol=${encodeURIComponent(shownSymbol)}`}><FiBell aria-hidden="true" /> Alert</Link>
                    <Link className="btn btn-small btn-primary" to={`/analysis/${assetType}/${encodeURIComponent(shownSymbol)}`}><FiBarChart2 aria-hidden="true" /> Analyze</Link>
                </>
            }
        >
            {q.note && <Notice tone="warning">{q.note}</Notice>}
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <div className="quote-price">
                <span className="price">{formatMoney(q.price, q.currency)}</span>
                <Change value={q.changePercent} />
                <span className="muted small">as of {formatDate(q.asOf, { time: assetType === 'crypto' })} · {q.source}</span>
            </div>
            <div className="stats">
                {q.open !== null && <Stat label="Open" value={formatMoney(q.open, q.currency)} />}
                {q.high !== null && <Stat label="High" value={formatMoney(q.high, q.currency)} />}
                {q.low !== null && <Stat label="Low" value={formatMoney(q.low, q.currency)} />}
                {q.previousClose !== null && <Stat label="Previous close" value={formatMoney(q.previousClose, q.currency)} />}
                {q.volume !== null && <Stat label="Volume" value={formatNumber(q.volume, { compact: true })} />}
                {q.marketCap != null && <Stat label="Market cap" value={formatMoney(q.marketCap, q.currency, { compact: true })} />}
                {i?.marketCapRank && <Stat label="Rank" value={`#${i.marketCapRank}`} />}
                {i?.allTimeHigh && <Stat label="All-time high" value={formatMoney(i.allTimeHigh)} sub={formatDate(i.allTimeHighDate)} />}
                {i?.circulatingSupply && <Stat label="Circulating supply" value={formatNumber(i.circulatingSupply, { compact: true })} sub={i.maxSupply ? `of ${formatNumber(i.maxSupply, { compact: true })}` : 'no max supply'} />}
            </div>
            {i?.description && <p className="description">{i.description.slice(0, 600)}{i.description.length > 600 ? '…' : ''}</p>}
            {i?.homepage && (
                <p className="small">
                    <a href={i.homepage} target="_blank" rel="noopener noreferrer nofollow">Official website ↗</a>
                </p>
            )}
        </Card>
    );
}
