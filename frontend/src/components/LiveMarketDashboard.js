import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './LiveMarketDashboard.css';

const LiveMarketDashboard = () => {
    const [watchlist, setWatchlist] = useState(['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'NVDA']);
    const [marketData, setMarketData] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedTimeframe, setSelectedTimeframe] = useState('daily');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearch, setShowSearch] = useState(false);

    // Fetch market data for all symbols in watchlist
    const fetchMarketData = useCallback(async () => {
        setLoading(true);
        const newMarketData = {};
        
        for (const symbol of watchlist) {
            try {
                const response = await axios.get(`/api/stocks/quote/${symbol}`);
                if (response.data.quote) {
                    newMarketData[symbol] = response.data.quote;
                }
            } catch (error) {
                console.log(`Error fetching data for ${symbol}:`, error);
            }
        }
        
        setMarketData(newMarketData);
        setLoading(false);
    }, [watchlist]);

    // Search for new symbols
    const searchSymbols = async (query) => {
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }
        
        try {
            const response = await axios.get(`/api/stocks/search/${query}`);
            setSearchResults(response.data.results || []);
        } catch (error) {
            console.log('Error searching symbols:', error);
        }
    };

    // Add symbol to watchlist
    const addToWatchlist = (symbol) => {
        if (!watchlist.includes(symbol)) {
            setWatchlist([...watchlist, symbol]);
            setSearchQuery('');
            setSearchResults([]);
            setShowSearch(false);
        }
    };

    // Remove symbol from watchlist
    const removeFromWatchlist = (symbol) => {
        setWatchlist(watchlist.filter(s => s !== symbol));
        const newMarketData = { ...marketData };
        delete newMarketData[symbol];
        setMarketData(newMarketData);
    };

    // Auto-refresh data every 30 seconds
    useEffect(() => {
        fetchMarketData();
        const interval = setInterval(fetchMarketData, 30000);
        return () => clearInterval(interval);
    }, [watchlist, fetchMarketData]);

    // Search effect
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchQuery) {
                searchSymbols(searchQuery);
            }
        }, 300);
        
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const getChangeColor = (change) => {
        return change >= 0 ? 'positive' : 'negative';
    };

    const formatVolume = (volume) => {
        if (volume >= 1000000000) {
            return (volume / 1000000000).toFixed(2) + 'B';
        } else if (volume >= 1000000) {
            return (volume / 1000000).toFixed(2) + 'M';
        } else if (volume >= 1000) {
            return (volume / 1000).toFixed(2) + 'K';
        }
        return volume.toLocaleString();
    };

    return (
        <div className="live-market-dashboard">
            <div className="dashboard-header">
                <h1>Live Market Dashboard</h1>
                <p>Real-time market data and professional trading insights</p>
                <div className="header-controls">
                    <button 
                        className="add-symbol-btn"
                        onClick={() => setShowSearch(!showSearch)}
                    >
                        + Add Symbol
                    </button>
                    <select 
                        value={selectedTimeframe} 
                        onChange={(e) => setSelectedTimeframe(e.target.value)}
                        className="timeframe-select"
                    >
                        <option value="1min">1 Minute</option>
                        <option value="5min">5 Minutes</option>
                        <option value="15min">15 Minutes</option>
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                    </select>
                </div>
            </div>

            {/* Search Bar */}
            {showSearch && (
                <div className="search-section">
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="Search for stocks, ETFs, or crypto..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                        {searchResults.length > 0 && (
                            <div className="search-results">
                                {searchResults.map((result, index) => (
                                    <div 
                                        key={index} 
                                        className="search-result-item"
                                        onClick={() => addToWatchlist(result.symbol)}
                                    >
                                        <div className="result-symbol">{result.symbol}</div>
                                        <div className="result-name">{result.name}</div>
                                        <div className="result-type">{result.type}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Market Overview */}
            <div className="market-overview">
                <h2>Market Overview</h2>
                <div className="overview-stats">
                    <div className="stat-card">
                        <div className="stat-label">Total Symbols</div>
                        <div className="stat-value">{watchlist.length}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Last Update</div>
                        <div className="stat-value">{new Date().toLocaleTimeString()}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Timeframe</div>
                        <div className="stat-value">{selectedTimeframe}</div>
                    </div>
                </div>
            </div>

            {/* Watchlist Grid */}
            <div className="watchlist-section">
                <h2>Live Watchlist</h2>
                {loading ? (
                    <div className="loading-grid">
                        {watchlist.map((symbol, index) => (
                            <div key={index} className="loading-card">
                                <div className="loading-skeleton"></div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="watchlist-grid">
                        {watchlist.map((symbol) => {
                            const data = marketData[symbol];
                            if (!data) return null;
                            
                            return (
                                <div key={symbol} className="stock-card">
                                    <div className="card-header">
                                        <div className="symbol-info">
                                            <h3>{symbol}</h3>
                                            <button 
                                                className="remove-btn"
                                                onClick={() => removeFromWatchlist(symbol)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="price-section">
                                        <div className="current-price">${data.price?.toFixed(2) || 'N/A'}</div>
                                        <div className={`price-change ${getChangeColor(data.change)}`}>
                                            {data.change >= 0 ? '+' : ''}{data.change?.toFixed(2) || 'N/A'} 
                                            ({data.changePercent || 'N/A'}%)
                                        </div>
                                    </div>
                                    
                                    <div className="card-details">
                                        <div className="detail-row">
                                            <span className="detail-label">Open:</span>
                                            <span className="detail-value">${data.open?.toFixed(2) || 'N/A'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">High:</span>
                                            <span className="detail-value">${data.high?.toFixed(2) || 'N/A'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Low:</span>
                                            <span className="detail-value">${data.low?.toFixed(2) || 'N/A'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Volume:</span>
                                            <span className="detail-value">{formatVolume(data.volume) || 'N/A'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Market Cap:</span>
                                            <span className="detail-value">${(data.marketCap / 1000000000).toFixed(2)}B</span>
                                        </div>
                                    </div>
                                    
                                    <div className="card-actions">
                                        <button className="action-btn chart-btn">View Chart</button>
                                        <button className="action-btn alert-btn">Set Alert</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="quick-actions">
                <h2>Quick Actions</h2>
                <div className="actions-grid">
                    <button className="quick-action-btn">
                        <span className="action-icon">📊</span>
                        <span>Portfolio Overview</span>
                    </button>
                    <button className="quick-action-btn">
                        <span className="action-icon">🔔</span>
                        <span>Price Alerts</span>
                    </button>
                    <button className="quick-action-btn">
                        <span className="action-icon">📈</span>
                        <span>Technical Analysis</span>
                    </button>
                    <button className="quick-action-btn">
                        <span className="action-icon">🤖</span>
                        <span>AI Insights</span>
                    </button>
                    <button className="quick-action-btn">
                        <span className="action-icon">📰</span>
                        <span>Market News</span>
                    </button>
                    <button className="quick-action-btn">
                        <span className="action-icon">⚡</span>
                        <span>Trading Signals</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LiveMarketDashboard; 