import { DISPLAY_CURRENCIES, useCurrency } from '../context/CurrencyContext';

export default function CurrencySelect() {
    const { currency, setCurrency } = useCurrency();
    return (
        <label className="inline-select">
            <span className="muted small">Show totals in</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Display currency">
                {DISPLAY_CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                ))}
            </select>
        </label>
    );
}
