import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaChartLine, FaWallet, FaBitcoin, FaSignOutAlt, FaUser, FaNewspaper, FaBell, FaLightbulb, FaSearch, FaComments, FaSmile, FaMagic } from 'react-icons/fa';
import './Navigation.css';

const Navigation = ({ onLogout, user }) => {
    const location = useLocation();

    return (
        <nav className="navigation">
            <div className="nav-links">
                <Link 
                    to="/dashboard" 
                    className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
                >
                    <FaChartLine /> Analytics
                </Link>
                <Link 
                    to="/portfolio" 
                    className={`nav-link ${location.pathname === '/portfolio' ? 'active' : ''}`}
                >
                    <FaWallet /> Holdings
                </Link>
                <Link 
                    to="/crypto" 
                    className={`nav-link ${location.pathname === '/crypto' ? 'active' : ''}`}
                >
                    <FaBitcoin /> Digital Assets
                </Link>
                <Link 
                    to="/indian-markets" 
                    className={`nav-link ${location.pathname === '/indian-markets' ? 'active' : ''}`}
                >
                    🇮🇳 Indian Markets
                </Link>
                <Link 
                    to="/news" 
                    className={`nav-link ${location.pathname === '/news' ? 'active' : ''}`}
                >
                    <FaNewspaper /> Market News
                </Link>
                <Link 
                    to="/alerts" 
                    className={`nav-link ${location.pathname === '/alerts' ? 'active' : ''}`}
                >
                    <FaBell /> Price Alerts
                </Link>
                <Link 
                    to="/ai-insights" 
                    className={`nav-link ${location.pathname === '/ai-insights' ? 'active' : ''}`}
                >
                    <FaLightbulb /> AI Analytics
                </Link>
                <Link 
                    to="/trading-signals" 
                    className={`nav-link ${location.pathname === '/trading-signals' ? 'active' : ''}`}
                >
                    <FaSearch /> Trading Signals
                </Link>
                <Link 
                    to="/nl-query" 
                    className={`nav-link ${location.pathname === '/nl-query' ? 'active' : ''}`}
                >
                    <FaComments /> AI Assistant
                </Link>
                <Link 
                    to="/sentiment" 
                    className={`nav-link ${location.pathname === '/sentiment' ? 'active' : ''}`}
                >
                    <FaSmile /> Market Sentiment
                </Link>
                <Link 
                    to="/predictions" 
                    className={`nav-link ${location.pathname === '/predictions' ? 'active' : ''}`}
                >
                    <FaMagic /> Intelligence
                </Link>
    </div>
            <div className="nav-user">
                <span className="user-info">
                    <FaUser /> {user?.username || 'Trader'}
                </span>
                <button onClick={onLogout} className="logout-button">
                    <FaSignOutAlt /> Sign Out
                </button>
            </div>
        </nav>
    );
};

export default Navigation; 