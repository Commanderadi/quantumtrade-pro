import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'quantumtrade-theme';
const ThemeContext = createContext(null);

function initialTheme() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
    } catch {
        /* storage unavailable */
    }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(initialTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            /* ignore */
        }
    }, [theme]);

    const value = useMemo(() => ({ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }), [theme]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
    return ctx;
}
