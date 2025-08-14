import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
    FaChartLine, 
    FaWallet, 
    FaBitcoin, 
    FaSignOutAlt, 
    FaUser,
    FaChartBar,
    FaGlobe
} from 'react-icons/fa';
import './Navigation.css';

const Navigation = ({ onLogout, user }) => {
    const location = useLocation();

    const isActive = (path) => location.pathname === path;

    return (
        <nav className="navigation">
            <div className="nav-brand">
                <h2>🚀 TradePro</h2>
            </div>
            
            <div className="nav-links">
                {/* Core Features */}
                <div className="nav-section">
                    <h4 className="nav-section-title">Core Features</h4>
                    <div className="nav-section-links">
                        <Link 
                            to="/dashboard" 
                            className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
                        >
                            <FaChartLine /> Dashboard
                        </Link>
                        <Link 
                            to="/portfolio" 
                            className={`nav-link ${isActive('/portfolio') ? 'active' : ''}`}
                        >
                            <FaWallet /> Portfolio
                        </Link>
                        <Link 
                            to="/crypto" 
                            className={`nav-link ${isActive('/crypto') ? 'active' : ''}`}
                        >
                            <FaBitcoin /> Crypto
                        </Link>
                        <Link 
                            to="/live-market" 
                            className={`nav-link ${isActive('/live-market') ? 'active' : ''}`}
                        >
                            <FaGlobe /> Live Market
                        </Link>
                    </div>
                </div>

                {/* Technical Analysis */}
                <div className="nav-section">
                    <h4 className="nav-section-title">Technical Analysis</h4>
                    <div className="nav-section-links">
                        <Link 
                            to="/rsi" 
                            className={`nav-link ${isActive('/rsi') ? 'active' : ''}`}
                        >
                            <FaChartLine /> RSI
                        </Link>
                        <Link 
                            to="/macd" 
                            className={`nav-link ${isActive('/macd') ? 'active' : ''}`}
                        >
                            <FaChartBar /> MACD
                        </Link>
                        <Link 
                            to="/bollinger-bands" 
                            className={`nav-link ${isActive('/bollinger-bands') ? 'active' : ''}`}
                        >
                            <FaChartLine /> Bollinger Bands
                        </Link>
                        <Link 
                            to="/volume-profile" 
                            className={`nav-link ${isActive('/volume-profile') ? 'active' : ''}`}
                        >
                            <FaChartBar /> Volume Profile
                        </Link>
                        <Link 
                            to="/atr" 
                            className={`nav-link ${isActive('/atr') ? 'active' : ''}`}
                        >
                            <FaChartLine /> ATR
                        </Link>
                    </div>
                </div>
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