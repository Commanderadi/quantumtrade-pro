import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaSearch, FaPlus, FaTimes, FaChartLine, FaBitcoin, FaStar, FaArrowUp } from 'react-icons/fa';
import './Dashboard.css';

const Dashboard = () => {
    // State for the Stock Search feature
    const [symbol, setSymbol] = useState('');
    const [stockData, setStockData] = useState(null);
    const [searchError, setSearchError] = useState('');

    // State for the Watchlist feature
    const [watchlist, setWatchlist] = useState([]);
    const [watchlistError, setWatchlistError] = useState('');

    // State for crypto search
    const [cryptoSymbol, setCryptoSymbol] = useState('');
    const [cryptoData, setCryptoData] = useState(null);
    const [cryptoError, setCryptoError] = useState('');

    // State for top cryptos
    const [topCryptos, setTopCryptos] = useState([]);


    // A helper function to create the authorization headers for API calls
    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error("No token found, user might be logged out.");
            return {};
        }
        return { headers: { 'x-auth-token': token } };
    };

    // This useEffect hook runs once when the Dashboard component is first displayed
    useEffect(() => {
        const fetchWatchlist = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                setWatchlistError('Please log in to view your watchlist.');
                return;
            }
            
            try {
                const response = await axios.get('/api/watchlist', getAuthHeaders());
                setWatchlist(response.data);
                setWatchlistError('');
            } catch (err) {
                if (err.response?.status === 401) {
                    setWatchlistError('Please log in to view your watchlist.');
                } else {
                    setWatchlistError('Could not fetch watchlist. Please try again.');
                }
                console.error(err);
            }
        };

        const fetchTopCryptos = async () => {
            try {
                const response = await axios.get('/api/crypto/top?limit=5');
                setTopCryptos(response.data);
            } catch (err) {
                console.error('Failed to fetch top cryptos:', err);
            }
        };

        fetchWatchlist();
        fetchTopCryptos();
    }, []);

    // Handles searching for a stock
    const handleStockSearch = async (e) => {
        e.preventDefault();
        setSearchError('');
        setStockData(null);
        if (!symbol) return setSearchError('Please enter a stock symbol.');

        try {
            const response = await axios.get(`/api/stocks/price/${symbol}`);
            setStockData(response.data);
        } catch (err) {
            setSearchError(err.response?.data?.message || 'Failed to fetch stock data.');
        }
    };

    // Handles searching for crypto
    const handleCryptoSearch = async (e) => {
        e.preventDefault();
        setCryptoError('');
        setCryptoData(null);
        if (!cryptoSymbol) return setCryptoError('Please enter a cryptocurrency symbol.');

        try {
            const response = await axios.get(`/api/crypto/price/${cryptoSymbol}`);
            setCryptoData(response.data);
        } catch (err) {
            setCryptoError(err.response?.data?.message || 'Failed to fetch crypto data.');
        }
    };

    // Handles adding a stock to watchlist
    const handleAddToWatchlist = async (symbol, type) => {
        try {
            await axios.post('/api/watchlist', { symbol, type }, getAuthHeaders());
            // Refresh watchlist
            const response = await axios.get('/api/watchlist', getAuthHeaders());
            setWatchlist(response.data);
        } catch (err) {
            console.error('Failed to add to watchlist:', err);
        }
    };

    // Handles removing a stock from watchlist
    const handleRemoveFromWatchlist = async (symbol) => {
        try {
            await axios.delete(`/api/watchlist/${symbol}`, getAuthHeaders());
            // Refresh watchlist
            const response = await axios.get('/api/watchlist', getAuthHeaders());
            setWatchlist(response.data);
        } catch (err) {
            console.error('Failed to remove from watchlist:', err);
        }
    };

    return (
        <div className="dashboard">
            {/* Welcome Section */}
            <div className="dashboard-header">
                <h1>Welcome to TradePro Dashboard</h1>
                <p>Your comprehensive financial intelligence platform</p>
            </div>

            {/* Quick Actions Grid */}
            <div className="quick-actions">
                <div className="action-card">
                    <FaSearch className="action-icon" />
                    <h3>Stock Search</h3>
                    <p>Search for stocks and view real-time data</p>
                </div>
                <div className="action-card">
                    <FaBitcoin className="action-icon" />
                    <h3>Crypto Search</h3>
                    <p>Explore cryptocurrency markets</p>
                </div>
                <div className="action-card">
                    <FaStar className="action-icon" />
                    <h3>Watchlist</h3>
                    <p>Track your favorite assets</p>
                </div>
                <div className="action-card">
                    <FaChartLine className="action-icon" />
                    <h3>Technical Analysis</h3>
                    <p>Advanced charting and indicators</p>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="dashboard-grid">
                {/* Stock Search Section */}
                <div className="dashboard-section">
                    <h2><FaSearch /> Stock Search</h2>
                    <form onSubmit={handleStockSearch} className="search-form">
                        <div className="search-input-group">
                            <input
                                type="text"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                placeholder="Enter stock symbol (e.g., AAPL)"
                                className="search-input"
                            />
                            <button type="submit" className="search-button">
                                <FaSearch />
                            </button>
                        </div>
                    </form>

                    {searchError && <div className="error-message">{searchError}</div>}
                    
                    {stockData && (
                        <div className="stock-result">
                            <div className="stock-info">
                                <h3>{stockData.symbol}</h3>
                                <p className="stock-price">${stockData.price}</p>
                                <p className="stock-change">{stockData.change} ({stockData.changePercent}%)</p>
                            </div>
                            <button 
                                onClick={() => handleAddToWatchlist(stockData.symbol, 'stock')}
                                className="add-watchlist-btn"
                            >
                                <FaPlus /> Add to Watchlist
                            </button>
                        </div>
                    )}
                </div>

                {/* Crypto Search Section */}
                <div className="dashboard-section">
                    <h2><FaBitcoin /> Crypto Search</h2>
                    <form onSubmit={handleCryptoSearch} className="search-form">
                        <div className="search-input-group">
                            <input
                                type="text"
                                value={cryptoSymbol}
                                onChange={(e) => setCryptoSymbol(e.target.value.toUpperCase())}
                                placeholder="Enter crypto symbol (e.g., BTC)"
                                className="search-input"
                            />
                            <button type="submit" className="search-button">
                                <FaSearch />
                            </button>
                        </div>
                    </form>

                    {cryptoError && <div className="error-message">{cryptoError}</div>}
                    
                    {cryptoData && (
                        <div className="crypto-result">
                            <div className="crypto-info">
                                <h3>{cryptoData.symbol}</h3>
                                <p className="crypto-price">${cryptoData.price}</p>
                                <p className="crypto-change">{cryptoData.change24h} ({cryptoData.changePercent24h}%)</p>
                            </div>
                            <button 
                                onClick={() => handleAddToWatchlist(cryptoData.symbol, 'crypto')}
                                className="add-watchlist-btn"
                            >
                                <FaPlus /> Add to Watchlist
                            </button>
                        </div>
                    )}
                </div>

                {/* Watchlist Section */}
                <div className="dashboard-section">
                    <h2><FaStar /> Your Watchlist</h2>
                    {watchlistError ? (
                        <p className="error-message">{watchlistError}</p>
                    ) : watchlist.length === 0 ? (
                        <p className="empty-state">No items in watchlist. Add some stocks or cryptos!</p>
                    ) : (
                        <div className="watchlist-items">
                            {watchlist.map((item, index) => (
                                <div key={index} className="watchlist-item">
                                    <div className="item-info">
                                        <span className="item-symbol">{item.symbol}</span>
                                        <span className="item-type">{item.type}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveFromWatchlist(item.symbol)}
                                        className="remove-btn"
                                    >
                                        <FaTimes />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top Cryptos Section */}
                <div className="dashboard-section">
                    <h2><FaArrowUp /> Top Cryptocurrencies</h2>
                    {topCryptos.length === 0 ? (
                        <p className="loading-state">Loading top cryptocurrencies...</p>
                    ) : (
                        <div className="top-cryptos">
                            {topCryptos.map((crypto, index) => (
                                <div key={index} className="crypto-item">
                                    <div className="crypto-rank">#{index + 1}</div>
                                    <div className="crypto-details">
                                        <span className="crypto-name">{crypto.name}</span>
                                        <span className="crypto-symbol">{crypto.symbol}</span>
                                    </div>
                                    <div className="crypto-price">${crypto.current_price}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
};

export default Dashboard; 