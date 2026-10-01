import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { FiBarChart2, FiBell, FiBriefcase, FiGrid, FiLogOut, FiMenu, FiMoon, FiSearch, FiSettings, FiSun, FiX } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV = [
    { to: '/', label: 'Dashboard', icon: FiGrid, end: true },
    { to: '/portfolio', label: 'Portfolio', icon: FiBriefcase },
    { to: '/markets', label: 'Markets', icon: FiSearch },
    { to: '/analysis', label: 'Analysis', icon: FiBarChart2 },
    { to: '/alerts', label: 'Alerts', icon: FiBell },
    { to: '/settings', label: 'Settings', icon: FiSettings },
];

export default function Layout() {
    const { user, logout } = useAuth();
    const { theme, toggle } = useTheme();
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    const [lastPath, setLastPath] = useState(location.pathname);
    if (lastPath !== location.pathname) {
        // Close the mobile menu on navigation.
        setLastPath(location.pathname);
        setMenuOpen(false);
    }

    return (
        <div className="shell">
            <a href="#main" className="skip-link">Skip to content</a>
            <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
                <div className="brand">
                    <img src="/favicon.svg" alt="" width="28" height="28" />
                    <span>QuantumTrade</span>
                    <button type="button" className="icon-btn menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                        <FiX />
                    </button>
                </div>
                <nav aria-label="Main">
                    {NAV.map(({ to, label, icon: Icon, end }) => (
                        <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                            <Icon aria-hidden="true" />
                            {label}
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    <div className="user-chip" title={user?.email}>
                        <span className="avatar" aria-hidden="true">{user?.username?.[0]?.toUpperCase()}</span>
                        <span className="user-name">{user?.username}</span>
                    </div>
                    <div className="sidebar-actions">
                        <button type="button" className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
                            {theme === 'dark' ? <FiSun /> : <FiMoon />}
                        </button>
                        <button type="button" className="icon-btn" onClick={logout} aria-label="Log out">
                            <FiLogOut />
                        </button>
                    </div>
                </div>
            </aside>
            {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
            <div className="main">
                <header className="topbar">
                    <button type="button" className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                        <FiMenu />
                    </button>
                    <span className="brand-small">QuantumTrade</span>
                </header>
                <main id="main" className="content">
                    <Outlet />
                </main>
                <footer className="footer">
                    Market data from Twelve Data, Finnhub, Alpha Vantage and CoinGecko; quotes may be delayed. Information only — not investment advice.
                </footer>
            </div>
        </div>
    );
}
