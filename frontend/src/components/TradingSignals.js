import React, { useState } from 'react';
import axios from 'axios';
import { FaSearch, FaChartLine, FaArrowUp, FaArrowDown, FaMinus, FaExclamationTriangle, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';
import './TradingSignals.css';

const TradingSignals = () => {
    const [symbol, setSymbol] = useState('');
    const [type, setType] = useState('stock');
    const [signals, setSignals] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!symbol.trim()) {
            setError('Please enter a symbol');
            return;
        }

        try {
            setLoading(true);
            setError('');
            const token = localStorage.getItem('token');
            const response = await axios.get(`/api/ai/signals?symbol=${symbol}&type=${type}`, {
                headers: { 'x-auth-token': token }
            });
            setSignals(response.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch trading signals');
            console.error('Trading signals error:', err);
        } finally {
            setLoading(false);
        }
    };

    const getSignalIcon = (type) => {
        switch (type) {
            case 'buy':
                return <FaArrowUp className="signal-icon buy" />;
            case 'sell':
                return <FaArrowDown className="signal-icon sell" />;
            default:
                return <FaMinus className="signal-icon neutral" />;
        }
    };

    const getStrengthColor = (strength) => {
        switch (strength) {
            case 'strong':
                return 'strong';
            case 'medium':
                return 'medium';
            case 'weak':
                return 'weak';
            default:
                return '';
        }
    };

    const getRSIColor = (rsi) => {
        if (rsi < 30) return 'oversold';
        if (rsi > 70) return 'overbought';
        return 'neutral';
    };

    return (
        <div className="trading-signals">
            <div className="signals-header">
                <h2><FaChartLine /> Advanced Trading Signals</h2>
                <p>AI-powered trading signals based on advanced technical analysis</p>
            </div>

            {/* Search Form */}
            <div className="search-section">
                <form onSubmit={handleSubmit} className="search-form">
                    <div className="form-group">
                        <label htmlFor="symbol">Symbol:</label>
                        <input
                            type="text"
                            id="symbol"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            placeholder="e.g., AAPL, BTC"
                            className="symbol-input"
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="type">Type:</label>
                        <select
                            id="type"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="type-select"
                        >
                            <option value="stock">Stock</option>
                            <option value="crypto">Cryptocurrency</option>
                        </select>
                    </div>
                    
                    <button type="submit" className="search-btn" disabled={loading}>
                        {loading ? 'Analyzing...' : <><FaSearch /> Get Signals</>}
                    </button>
                </form>
            </div>

            {error && (
                <div className="error-message">
                    <FaExclamationTriangle /> {error}
                </div>
            )}

            {signals && (
                <div className="signals-content">
                    {/* Symbol Info */}
                    <div className="symbol-info">
                        <h3>{signals.symbol} ({signals.type.toUpperCase()})</h3>
                        <div className="current-price">
                            Current Price: <span className="price">${signals.currentPrice.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Trading Signals */}
                    <div className="signals-section">
                        <h3><FaChartLine /> Trading Signals</h3>
                        {signals.signals.message ? (
                            <div className="no-signals">
                                <FaInfoCircle /> {signals.signals.message}
                            </div>
                        ) : (
                            <div className="signals-grid">
                                {signals.signals.signals.map((signal, index) => (
                                    <div key={index} className={`signal-card ${getStrengthColor(signal.strength)}`}>
                                        <div className="signal-header">
                                            {getSignalIcon(signal.type)}
                                            <span className={`signal-type ${signal.type}`}>
                                                {signal.type.toUpperCase()}
                                            </span>
                                            <span className={`strength-badge ${signal.strength}`}>
                                                {signal.strength}
                                            </span>
                                        </div>
                                        <p className="signal-reason">{signal.reason}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Technical Indicators */}
                    {signals.signals.indicators && (
                        <div className="indicators-section">
                            <h3>Technical Indicators</h3>
                            <div className="indicators-grid">
                                <div className="indicator-card">
                                    <div className="indicator-label">SMA 20</div>
                                    <div className="indicator-value">${signals.signals.indicators.sma20.toFixed(2)}</div>
                                    <div className="indicator-status">
                                        {signals.currentPrice > signals.signals.indicators.sma20 ? 
                                            <FaArrowUp className="status-icon bullish" /> : 
                                            <FaArrowDown className="status-icon bearish" />
                                        }
                                    </div>
                                </div>
                                
                                <div className="indicator-card">
                                    <div className="indicator-label">SMA 50</div>
                                    <div className="indicator-value">${signals.signals.indicators.sma50.toFixed(2)}</div>
                                    <div className="indicator-status">
                                        {signals.currentPrice > signals.signals.indicators.sma50 ? 
                                            <FaArrowUp className="status-icon bullish" /> : 
                                            <FaArrowDown className="status-icon bearish" />
                                        }
                                    </div>
                                </div>
                                
                                <div className="indicator-card">
                                    <div className="indicator-label">RSI</div>
                                    <div className={`indicator-value ${getRSIColor(signals.signals.indicators.rsi)}`}>
                                        {signals.signals.indicators.rsi}
                                    </div>
                                    <div className="indicator-status">
                                        {signals.signals.indicators.rsi < 30 ? 
                                            <FaArrowUp className="status-icon oversold" /> :
                                            signals.signals.indicators.rsi > 70 ? 
                                            <FaArrowDown className="status-icon overbought" /> :
                                            <FaMinus className="status-icon neutral" />
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Price History */}
                    {signals.priceData && signals.priceData.length > 0 && (
                        <div className="price-history-section">
                            <h3>Recent Price History</h3>
                            <div className="price-table">
                                <div className="price-header">
                                    <span>Date</span>
                                    <span>Close Price</span>
                                </div>
                                {signals.priceData.slice(0, 10).map((data, index) => (
                                    <div key={index} className="price-row">
                                        <span>{new Date(data.date).toLocaleDateString()}</span>
                                        <span>${data.close.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    <div className="summary-section">
                        <h3>Signal Summary</h3>
                        <div className="summary-content">
                            {signals.signals.signals && signals.signals.signals.length > 0 ? (
                                <div className="summary-stats">
                                    <div className="stat-item">
                                        <span className="stat-label">Total Signals:</span>
                                        <span className="stat-value">{signals.signals.signals.length}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Buy Signals:</span>
                                        <span className="stat-value buy">
                                            {signals.signals.signals.filter(s => s.type === 'buy').length}
                                        </span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Sell Signals:</span>
                                        <span className="stat-value sell">
                                            {signals.signals.signals.filter(s => s.type === 'sell').length}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <p className="no-summary">No trading signals available for this symbol.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TradingSignals; 