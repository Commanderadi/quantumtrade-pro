import { Market } from '../lib/api';
import { useAsync, useInterval } from '../lib/useAsync';
import { formatMoney } from '../lib/format';
import { Change, ErrorMessage, Spinner } from './ui';

/** Headline market indices (tracked through ETFs on the free data plans). */
export default function IndicesStrip() {
    const state = useAsync((signal) => Market.indices({ signal }), []);
    useInterval(state.reload, 5 * 60_000);

    if (state.loading && !state.data) return <Spinner label="Loading markets…" />;
    if (state.error) return <ErrorMessage error={state.error} onRetry={state.reload} />;
    const items = state.data.indices;
    if (!items.length) return null;
    return (
        <div className="indices" role="list" aria-label="Market indices">
            {items.map((i) => (
                <div className="index-card" role="listitem" key={i.symbol} title={i.error ?? undefined}>
                    <div className="index-label">{i.label}</div>
                    {i.quote ? (
                        <>
                            <div className="index-price">{formatMoney(i.quote.price, i.quote.currency)}</div>
                            <Change value={i.quote.changePercent} />
                        </>
                    ) : (
                        <div className="muted small">{/paid/i.test(i.error ?? '') ? 'Needs a paid data plan' : i.error || 'Unavailable'}</div>
                    )}
                </div>
            ))}
        </div>
    );
}
