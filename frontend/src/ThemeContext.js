import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    const [isDark, setIsDark] = useState(() => {
        // Check localStorage for saved theme preference
        const savedTheme = localStorage.getItem('quantumtrade-theme');
        if (savedTheme) {
            return savedTheme === 'dark';
        }
        // Default to dark theme for professional look
        return true;
    });

    useEffect(() => {
        // Save theme preference to localStorage
        localStorage.setItem('quantumtrade-theme', isDark ? 'dark' : 'light');
        
        // Apply theme to document body
        document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
        
        // Update CSS custom properties
        const root = document.documentElement;
        if (isDark) {
            root.style.setProperty('--bg-primary', '#0f172a');
            root.style.setProperty('--bg-secondary', '#1e293b');
            root.style.setProperty('--bg-tertiary', '#334155');
            root.style.setProperty('--text-primary', '#f8fafc');
            root.style.setProperty('--text-secondary', '#cbd5e1');
            root.style.setProperty('--text-muted', '#94a3b8');
            root.style.setProperty('--border-color', '#475569');
            root.style.setProperty('--accent-primary', '#3b82f6');
            root.style.setProperty('--accent-secondary', '#1d4ed8');
            root.style.setProperty('--success-color', '#10b981');
            root.style.setProperty('--error-color', '#ef4444');
            root.style.setProperty('--warning-color', '#f59e0b');
            root.style.setProperty('--card-bg', '#1e293b');
            root.style.setProperty('--card-border', '#334155');
            root.style.setProperty('--shadow-color', 'rgba(0, 0, 0, 0.3)');
        } else {
            root.style.setProperty('--bg-primary', '#ffffff');
            root.style.setProperty('--bg-secondary', '#f8fafc');
            root.style.setProperty('--bg-tertiary', '#f1f5f9');
            root.style.setProperty('--text-primary', '#1e293b');
            root.style.setProperty('--text-secondary', '#475569');
            root.style.setProperty('--text-muted', '#64748b');
            root.style.setProperty('--border-color', '#e2e8f0');
            root.style.setProperty('--accent-primary', '#3b82f6');
            root.style.setProperty('--accent-secondary', '#1d4ed8');
            root.style.setProperty('--success-color', '#10b981');
            root.style.setProperty('--error-color', '#ef4444');
            root.style.setProperty('--warning-color', '#f59e0b');
            root.style.setProperty('--card-bg', '#ffffff');
            root.style.setProperty('--card-border', '#e2e8f0');
            root.style.setProperty('--shadow-color', 'rgba(0, 0, 0, 0.1)');
        }
    }, [isDark]);

    const toggleTheme = () => {
        setIsDark(prev => !prev);
    };

    const value = {
        isDark,
        toggleTheme,
        theme: isDark ? 'dark' : 'light'
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}; 