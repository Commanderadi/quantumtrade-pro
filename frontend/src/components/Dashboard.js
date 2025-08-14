import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaSearch, FaPlus, FaTimes, FaChartLine, FaBitcoin } from 'react-icons/fa';
import StockChart from './StockChart';
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
    // State for selected symbol for chart
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [selectedType, setSelectedType] = useState('stock');

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

    // Handles adding a stock to the user's watchlist
    const handleAddToWatchlist = async (symbolToAdd) => {
        try {
            await axios.post('/api/watchlist', { symbol: symbolToAdd }, getAuthHeaders());
            
            if (!watchlist.includes(symbolToAdd)) {
                setWatchlist([...watchlist, symbolToAdd]);
            }
            setStockData(null);
            setSymbol('');
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to add to watchlist.');
        }
    };

    // Handles removing a stock from the user's watchlist
    const handleRemoveFromWatchlist = async (symbolToRemove) => {
        try {
            await axios.delete(`/api/watchlist/${symbolToRemove}`, getAuthHeaders());
            setWatchlist(watchlist.filter(s => s !== symbolToRemove));
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to remove from watchlist.');
        }
    };

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h2>Market Analytics Dashboard</h2>
                <p>Real-time market data and portfolio insights</p>
            </div>
            <div className="dashboard-grid">
                {/* Watchlist Widget */}
                <div className="dashboard-widget">
                    <h3><FaChartLine /> My Watchlist</h3>
                    {watchlistError && <p className="message error">{watchlistError}</p>}
                    {watchlist.length > 0 ? (
                        <ul className="watchlist-list">
                            {watchlist.map(stockSymbol => (
                                <li key={stockSymbol}>
                                    <span>{stockSymbol}</span>
                                    <button 
                                        onClick={() => handleRemoveFromWatchlist(stockSymbol)} 
                                        className="remove-btn"
                                    >
                                        <FaTimes />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Your watchlist is empty. Search for a stock to add it.</p>
                    )}
                </div>

                {/* Stock Search Widget */}
                <div className="dashboard-widget">
                    <h3><FaChartLine /> Stock Price Finder</h3>
                    <form onSubmit={handleStockSearch}>
                        <div className="search-input">
                            <input
                                type="text"
                                placeholder="Enter Stock Symbol (e.g., AAPL)"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            />
                            <button type="submit"><FaSearch /></button>
                        </div>
                    </form>

                    {searchError && <p className="message error">{searchError}</p>}
                    
                    {stockData && (
                        <div className="stock-info">
                            <h4>{stockData.symbol}</h4>
                            <p><strong>Price:</strong> ${parseFloat(stockData.price).toFixed(2)}</p>
                            <p>
                                <strong>Change:</strong>
                                <span style={{ color: parseFloat(stockData.change) >= 0 ? 'green' : 'red' }}>
                                    {parseFloat(stockData.change).toFixed(2)} ({stockData.changePercent})
                                </span>
                            </p>
                            {stockData.volume && <p><strong>Volume:</strong> {parseInt(stockData.volume).toLocaleString()}</p>}
                            <button onClick={() => handleAddToWatchlist(stockData.symbol)} className="add-btn">
                                <FaPlus /> Add to Watchlist
                            </button>
                            <button 
                                onClick={() => {
                                    setSelectedSymbol(stockData.symbol);
                                    setSelectedType('stock');
                                }} 
                                className="chart-btn"
                            >
                                <FaChartLine /> View Chart
                            </button>
                        </div>
                    )}
                </div>

                {/* Crypto Search Widget */}
                <div className="dashboard-widget">
                    <h3><FaBitcoin /> Crypto Price Finder</h3>
                    <form onSubmit={handleCryptoSearch}>
                        <div className="search-input">
                            <input
                                type="text"
                                placeholder="Enter Crypto Symbol (e.g., bitcoin)"
                                value={cryptoSymbol}
                                onChange={(e) => setCryptoSymbol(e.target.value.toLowerCase())}
                            />
                            <button type="submit"><FaSearch /></button>
                        </div>
                    </form>

                    {cryptoError && <p className="message error">{cryptoError}</p>}
                    
                    {cryptoData && (
                        <div className="crypto-info">
                            <h4>{cryptoData.symbol}</h4>
                            <p><strong>Price:</strong> ${parseFloat(cryptoData.price).toFixed(2)}</p>
                            <p>
                                <strong>24h Change:</strong>
                                <span style={{ color: parseFloat(cryptoData.change24h) >= 0 ? 'green' : 'red' }}>
                                    {parseFloat(cryptoData.change24h).toFixed(2)}% ({cryptoData.changePercent})
                                </span>
                            </p>
                            {cryptoData.volume24h && <p><strong>24h Volume:</strong> ${parseInt(cryptoData.volume24h).toLocaleString()}</p>}
                            {cryptoData.marketCap && <p><strong>Market Cap:</strong> ${parseInt(cryptoData.marketCap).toLocaleString()}</p>}
                            <button onClick={() => handleAddToWatchlist(cryptoData.symbol)} className="add-btn">
                                <FaPlus /> Add to Watchlist
                            </button>
                            <button 
                                onClick={() => {
                                    setSelectedSymbol(cryptoData.symbol);
                                    setSelectedType('crypto');
                                }} 
                                className="chart-btn"
                            >
                                <FaChartLine /> View Chart
                            </button>
                        </div>
                    )}
                </div>

                {/* Top Cryptos Widget */}
                <div className="dashboard-widget">
                    <h3><FaBitcoin /> Top Cryptocurrencies</h3>
                    {topCryptos.length > 0 ? (
                        <div className="top-cryptos">
                            {topCryptos.map((crypto, index) => (
                                <div key={crypto.symbol} className="crypto-item">
                                    <span className="crypto-rank">#{index + 1}</span>
                                    <span className="crypto-symbol">{crypto.symbol}</span>
                                    <span className="crypto-price">${crypto.price.toFixed(2)}</span>
                                    <span 
                                        className={`crypto-change ${crypto.change24h >= 0 ? 'positive' : 'negative'}`}
                                    >
                                        {crypto.change24h.toFixed(2)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>Loading top cryptocurrencies...</p>
                    )}
                </div>

                {/* Chart Widget */}
                {selectedSymbol && (
                    <div className="dashboard-widget chart-widget">
                        <StockChart symbol={selectedSymbol} type={selectedType} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard; 