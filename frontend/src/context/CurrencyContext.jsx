import { createContext, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'quantumtrade-display-currency';
export const DISPLAY_CURRENCIES = [
    { value: 'ORIGINAL', label: 'Original currencies' },
    { value: 'INR', label: 'Indian rupee (₹)' },
    { value: 'USD', label: 'US dollar ($)' },
    { value: 'EUR', label: 'Euro (€)' },
    { value: 'GBP', label: 'British pound (£)' },
];

const CurrencyContext = createContext(null);

function initial() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (DISPLAY_CURRENCIES.some((c) => c.value === saved)) return saved;
    } catch {
        /* storage unavailable */
    }
    return 'ORIGINAL';
}

export function CurrencyProvider({ children }) {
    const [currency, setCurrencyState] = useState(initial);
    const value = useMemo(
        () => ({
            currency,
            // Currency code to request from the API, or undefined to keep each position's own currency.
            apiCurrency: currency === 'ORIGINAL' ? undefined : currency,
            setCurrency: (c) => {
                setCurrencyState(c);
                try {
                    localStorage.setItem(STORAGE_KEY, c);
                } catch {
                    /* ignore */
                }
            },
        }),
        [currency]
    );
    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
    const ctx = useContext(CurrencyContext);
    if (!ctx) throw new Error('useCurrency must be used inside <CurrencyProvider>');
    return ctx;
}
