import React from 'react';
import { useTheme } from '../ThemeContext';
import { FaSun, FaMoon } from 'react-icons/fa';
import './ThemeToggle.css';

const ThemeToggle = () => {
    const { isDark, toggleTheme } = useTheme();

    return (
        <button 
            className={`theme-toggle ${isDark ? 'dark' : 'light'}`}
            onClick={toggleTheme}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
        >
            <div className="toggle-icon">
                {isDark ? (
                    <FaSun className="sun-icon" />
                ) : (
                    <FaMoon className="moon-icon" />
                )}
            </div>
            <div className="toggle-track">
                <div className="toggle-thumb"></div>
            </div>
        </button>
    );
};

export default ThemeToggle; 