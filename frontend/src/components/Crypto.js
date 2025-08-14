import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaSearch, FaBitcoin, FaGlobe, FaGithub } from 'react-icons/fa';
import './Crypto.css';

const Crypto = () => {
    const [searchSymbol, setSearchSymbol] = useState('');
    const [cryptoData, setCryptoData] = useState(null);
    const [cryptoInfo, setCryptoInfo] = useState(null);
    const [topCryptos, setTopCryptos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchTopCryptos();
    }, []);

    const fetchTopCryptos = async () => {
        try {
            const response = await axios.get('/api/crypto/top?limit=20');
            setTopCryptos(response.data);
        } catch (err) {
            console.error('Failed to fetch top cryptos:', err);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchSymbol) return;

        setLoading(true);
        setError('');
        setCryptoData(null);
        setCryptoInfo(null);

        try {
            const [priceResponse, infoResponse] = await Promise.all([
                axios.get(`/api/crypto/price/${searchSymbol.toLowerCase()}`),
                axios.get(`/api/crypto/info/${searchSymbol.toLowerCase()}`)
            ]);

            setCryptoData(priceResponse.data);
            setCryptoInfo(infoResponse.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch cryptocurrency data.');
        } finally {
            setLoading(false);
        }
    };

    const formatNumber = (num) => {
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toFixed(2);
    };

    return (
        <div className="crypto-page">
            <div className="crypto-header">
                <h2><FaBitcoin /> Digital Assets Market</h2>
            </div>

            {/* Search Section */}
            <div className="crypto-search-section">
                <form onSubmit={handleSearch} className="crypto-search-form">
                    <div className="search-input-group">
                        <input
                            type="text"
                            placeholder="Search cryptocurrency (e.g., bitcoin, ethereum)"
                            value={searchSymbol}
                            onChange={(e) => setSearchSymbol(e.target.value.toLowerCase())}
                            className="crypto-search-input"
                        />
                        <button type="submit" className="search-btn" disabled={loading}>
                            <FaSearch />
                        </button>
                    </div>
                </form>

                {error && <p className="error-message">{error}</p>}
            </div>

            {/* Search Results */}
            {cryptoData && cryptoInfo && (
                <div className="crypto-details">
                    <div className="crypto-price-card">
                        <div className="crypto-header-info">
                            <h3>{cryptoInfo.name} ({cryptoData.symbol})</h3>
                            {cryptoInfo.image && (
                                <img src={cryptoInfo.image} alt={cryptoInfo.name} className="crypto-image" />
                            )}
                        </div>
                        
                        <div className="price-info">
                            <div className="current-price">
                                <span className="price-label">Current Price</span>
                                <span className="price-value">${parseFloat(cryptoData.price).toLocaleString()}</span>
                            </div>
                            
                            <div className="price-change">
                                <span className="change-label">24h Change</span>
                                <span 
                                    className={`change-value ${parseFloat(cryptoData.change24h) >= 0 ? 'positive' : 'negative'}`}
                                >
                                    {parseFloat(cryptoData.change24h).toFixed(2)}%
                                </span>
                            </div>
                        </div>

                        <div className="market-stats">
                            <div className="stat-item">
                                <span className="stat-label">Market Cap</span>
                                <span className="stat-value">${formatNumber(cryptoData.marketCap)}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">24h Volume</span>
                                <span className="stat-value">${formatNumber(cryptoData.volume24h)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="crypto-info-card">
                        <h4>About {cryptoInfo.name}</h4>
                        <p className="crypto-description">
                            {cryptoInfo.description?.substring(0, 300)}...
                        </p>
                        
                        <div className="crypto-links">
                            {cryptoInfo.homepage && (
                                <a href={cryptoInfo.homepage} target="_blank" rel="noopener noreferrer" className="crypto-link">
                                    <FaGlobe /> Website
                                </a>
                            )}
                            {cryptoInfo.reposUrl && (
                                <a href={cryptoInfo.reposUrl} target="_blank" rel="noopener noreferrer" className="crypto-link">
                                    <FaGithub /> GitHub
                                </a>
                            )}
                        </div>

                        <div className="additional-stats">
                            <div className="stat-row">
                                <span>Circulating Supply:</span>
                                <span>{formatNumber(cryptoInfo.circulatingSupply)}</span>
                            </div>
                            <div className="stat-row">
                                <span>Total Supply:</span>
                                <span>{formatNumber(cryptoInfo.totalSupply)}</span>
                            </div>
                            <div className="stat-row">
                                <span>All Time High:</span>
                                <span>${parseFloat(cryptoInfo.ath).toLocaleString()}</span>
                            </div>
                            <div className="stat-row">
                                <span>All Time Low:</span>
                                <span>${parseFloat(cryptoInfo.atl).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Cryptocurrencies */}
            <div className="top-cryptos-section">
                <h3>Top Cryptocurrencies by Market Cap</h3>
                <div className="crypto-table">
                    <div className="table-header">
                        <span className="rank-col">#</span>
                        <span className="name-col">Name</span>
                        <span className="price-col">Price</span>
                        <span className="change-col">24h Change</span>
                        <span className="market-cap-col">Market Cap</span>
                        <span className="volume-col">Volume</span>
                    </div>
                    
                    {topCryptos.map((crypto, index) => (
                        <div key={crypto.symbol} className="crypto-row">
                            <span className="rank-col">{index + 1}</span>
                            <span className="name-col">
                                <img src={crypto.image} alt={crypto.name} className="crypto-icon" />
                                {crypto.name} ({crypto.symbol.toUpperCase()})
                            </span>
                            <span className="price-col">${crypto.price.toLocaleString()}</span>
                            <span className={`change-col ${crypto.change24h >= 0 ? 'positive' : 'negative'}`}>
                                {crypto.change24h.toFixed(2)}%
                            </span>
                            <span className="market-cap-col">${formatNumber(crypto.marketCap)}</span>
                            <span className="volume-col">${formatNumber(crypto.volume24h)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Crypto; 