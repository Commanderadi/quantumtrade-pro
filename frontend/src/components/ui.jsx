import { trendClass, formatPercent } from '../lib/format';

export function Card({ title, actions, children, className = '' }) {
    return (
        <section className={`card ${className}`}>
            {(title || actions) && (
                <header className="card-header">
                    {title && <h2>{title}</h2>}
                    {actions && <div className="card-actions">{actions}</div>}
                </header>
            )}
            {children}
        </section>
    );
}

export function Spinner({ label = 'Loading…' }) {
    return (
        <div className="spinner" role="status" aria-live="polite">
            <span className="spinner-dot" aria-hidden="true" />
            {label}
        </div>
    );
}

export function ErrorMessage({ error, onRetry }) {
    if (!error) return null;
    const message = typeof error === 'string' ? error : error.message;
    return (
        <div className="alert alert-error" role="alert">
            <span>{message}</span>
            {onRetry && (
                <button type="button" className="btn btn-small btn-ghost" onClick={onRetry}>
                    Retry
                </button>
            )}
        </div>
    );
}

export function Notice({ children, tone = 'info' }) {
    // A single wrapper keeps mixed text and inline elements together inside the flex container.
    return <div className={`alert alert-${tone}`}><div>{children}</div></div>;
}

export function EmptyState({ title, children }) {
    return (
        <div className="empty">
            <p className="empty-title">{title}</p>
            {children && <div className="empty-body">{children}</div>}
        </div>
    );
}

export function Change({ value, children }) {
    return <span className={`change ${trendClass(value)}`}>{children ?? formatPercent(value)}</span>;
}

export function Stat({ label, value, sub, tone }) {
    return (
        <div className="stat">
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${tone ? trendClass(tone) : ''}`}>{value}</div>
            {sub && <div className="stat-sub">{sub}</div>}
        </div>
    );
}

export function AssetBadge({ type }) {
    return <span className={`badge badge-${type}`}>{type === 'crypto' ? 'Crypto' : 'Stock'}</span>;
}

export function Segmented({ value, onChange, options, label }) {
    return (
        <div className="segmented" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={value === o.value ? 'active' : ''}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export const ASSET_OPTIONS = [
    { value: 'stock', label: 'Stocks' },
    { value: 'crypto', label: 'Crypto' },
];
