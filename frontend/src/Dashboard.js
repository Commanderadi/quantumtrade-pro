import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css'; // We'll add some styles for the new elements

const Dashboard = ({ onLogout }) => {
    // State for the Stock Search feature
    const [symbol, setSymbol] = useState('');
    const [stockData, setStockData] = useState(null);
    const [searchError, setSearchError] = useState('');

    // State for the Watchlist feature
    const [watchlist, setWatchlist] = useState([]);
    const [watchlistError, setWatchlistError] = useState('');

    // A helper function to create the authorization headers for API calls
    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error("No token found, user might be logged out.");
            onLogout(); // Log out if token is missing
            return {};
        }
        return { headers: { 'x-auth-token': token } };
    };

    // This useEffect hook runs once when the Dashboard component is first displayed
    useEffect(() => {
        const fetchWatchlist = async () => {
            try {
                // Call the GET /api/watchlist endpoint to get the user's saved stocks
                const response = await axios.get('/api/watchlist', getAuthHeaders());
                setWatchlist(response.data); // Save the watchlist to our state
            } catch (err) {
                setWatchlistError('Could not fetch watchlist. Please try logging in again.');
                console.error(err);
            }
        };

        fetchWatchlist();
        // The empty array [] ensures this effect runs only one time on mount
    }, []);

    // Handles searching for a stock
    const handleSearch = async (e) => {
        e.preventDefault();
        setSearchError('');
        setStockData(null);
        if (!symbol) return setSearchError('Please enter a stock symbol.');

        try {
            // This is a public endpoint, so it doesn't need auth headers
            const response = await axios.get(`/api/stocks/price/${symbol}`);
            setStockData(response.data);
        } catch (err) {
            setSearchError(err.response?.data?.message || 'Failed to fetch stock data.');
        }
    };

    // Handles adding a stock to the user's watchlist
    const handleAddToWatchlist = async (symbolToAdd) => {
        try {
            // Call the POST /api/watchlist endpoint, sending the symbol
            await axios.post('/api/watchlist', { symbol: symbolToAdd }, getAuthHeaders());
            
            // Update the UI immediately without needing to re-fetch from the DB
            if (!watchlist.includes(symbolToAdd)) {
                setWatchlist([...watchlist, symbolToAdd]);
            }
            setStockData(null); // Clear search result after adding
            setSymbol(''); // Clear search input
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to add to watchlist.');
        }
    };

    // Handles removing a stock from the user's watchlist
    const handleRemoveFromWatchlist = async (symbolToRemove) => {
        try {
            // Call the DELETE /api/watchlist/:symbol endpoint
            await axios.delete(`/api/watchlist/${symbolToRemove}`, getAuthHeaders());
            
            // Update the UI immediately by filtering the removed stock out of the array
            setWatchlist(watchlist.filter(s => s !== symbolToRemove));
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to remove from watchlist.');
        }
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h2>Dashboard</h2>
                <button onClick={onLogout} className="logout-button">Logout</button>
            </header>

            <div className="dashboard-main-content">
                {/* Watchlist Widget */}
                <div className="dashboard-widget">
                    <h3>My Watchlist</h3>
                    {watchlistError && <p className="message error">{watchlistError}</p>}
                    {watchlist.length > 0 ? (
                        <ul className="watchlist-list">
                            {watchlist.map(stockSymbol => (
                                <li key={stockSymbol}>
                                    <span>{stockSymbol}</span>
                                    <button onClick={() => handleRemoveFromWatchlist(stockSymbol)} className="remove-btn">
                                        &times;
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
                    <h3>Stock Price Finder</h3>
                    <form onSubmit={handleSearch}>
                        <input
                            type="text"
                            placeholder="Enter Stock Symbol (e.g., AAPL)"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        />
                        <button type="submit">Search</button>
                    </form>

                    {searchError && <p className="message error">{searchError}</p>}
                    
                    {stockData && (
                        <div className="stock-info">
                            <h3>{stockData.symbol}</h3>
                            <p><strong>Price:</strong> ${parseFloat(stockData.price).toFixed(2)}</p>
                            <p>
                                <strong>Change:</strong>
                                <span style={{ color: parseFloat(stockData.change) >= 0 ? 'green' : 'red' }}>
                                    {parseFloat(stockData.change).toFixed(2)} ({stockData.changePercent})
                                </span>
                            </p>
                            <button onClick={() => handleAddToWatchlist(stockData.symbol)} className="add-btn">
                                Add to Watchlist
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;