import { useEffect, useId, useRef, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { Market } from '../lib/api';
import { Segmented, ASSET_OPTIONS } from './ui';

/**
 * Asset type toggle + symbol input with debounced provider search.
 * Calls onSelect({ assetType, symbol, name }) when a result is chosen or Enter is pressed.
 */
export default function SymbolSearch({ onSelect, assetType: controlledType, onAssetTypeChange, defaultAssetType = 'stock', placeholder, submitLabel = 'Go', busy = false }) {
    const [localType, setLocalType] = useState(defaultAssetType);
    const assetType = controlledType ?? localType;
    const setAssetType = onAssetTypeChange ?? setLocalType;
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [searchError, setSearchError] = useState('');
    const listId = useId();
    const wrapRef = useRef(null);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults([]);
            setSearchError('');
            return undefined;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            Market.search(assetType, term, { signal: controller.signal })
                .then(({ results: r }) => {
                    setResults(r.slice(0, 8));
                    setSearchError('');
                    setActive(-1);
                })
                .catch((err) => {
                    if (err.name === 'AbortError') return;
                    setResults([]);
                    setSearchError(err.message);
                });
        }, 350);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, assetType]);

    useEffect(() => {
        const close = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const choose = (item) => {
        setOpen(false);
        setQuery('');
        setResults([]);
        onSelect({ assetType, symbol: item.symbol.toUpperCase(), name: item.name });
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, -1));
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    const onSubmit = (e) => {
        e.preventDefault();
        if (active >= 0 && results[active]) return choose(results[active]);
        const symbol = query.trim();
        if (symbol) choose({ symbol });
    };

    return (
        <form className="symbol-search" onSubmit={onSubmit} ref={wrapRef}>
            <Segmented label="Asset type" value={assetType} onChange={setAssetType} options={ASSET_OPTIONS} />
            <div className="search-box">
                <FiSearch aria-hidden="true" className="search-icon" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder ?? (assetType === 'crypto' ? 'Symbol or name, e.g. BTC' : 'Symbol or company, e.g. AAPL or TCS.NSE')}
                    aria-label="Symbol"
                    role="combobox"
                    aria-expanded={open && results.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    autoComplete="off"
                    spellCheck="false"
                    maxLength={50}
                />
                {open && (results.length > 0 || searchError) && (
                    <ul className="search-results" id={listId} role="listbox">
                        {searchError && <li className="search-error">{searchError}</li>}
                        {results.map((r, i) => (
                            <li
                                key={`${r.symbol}-${r.coinId ?? r.region ?? i}`}
                                role="option"
                                aria-selected={i === active}
                                className={i === active ? 'active' : ''}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    choose(r);
                                }}
                            >
                                <strong>{r.symbol}</strong>
                                <span className="muted">{r.name}</span>
                                {r.region && <span className="muted small">{r.region}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !query.trim()}>
                {submitLabel}
            </button>
        </form>
    );
}
