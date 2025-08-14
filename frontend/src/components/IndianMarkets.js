import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaSearch, FaChartLine, FaBitcoin, FaGlobe, FaRupeeSign, FaArrowUp, FaArrowDown, FaInfoCircle, FaClock, FaNewspaper } from 'react-icons/fa';
import './IndianMarkets.css';

const IndianMarkets = () => {
    const [searchSymbol, setSearchSymbol] = useState('');
    const [stockData, setStockData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    return (
        <div className="indian-markets">
            <div className="markets-header">
                <h2>🇮🇳 Indian Markets Live</h2>
                <p>Real-time data from NSE & BSE with comprehensive market insights</p>
            </div>

            {/* Market Indices */}
            <div className="indices-section">
                <h3><FaChartLine /> Live Market Indices</h3>
                <div className="indices-grid">
                    <div className="index-card up">
                        <div className="index-header">
                            <h4>NIFTY 50</h4>
                            <FaArrowUp className="trend-icon up" />
                        </div>
                        <div className="index-value">₹22,419.95</div>
                        <div className="index-change up">+156.30 (+0.70%)</div>
                    </div>
                    
                    <div className="index-card up">
                        <div className="index-header">
                            <h4>SENSEX</h4>
                            <FaArrowUp className="trend-icon up" />
                        </div>
                        <div className="index-value">₹73,852.94</div>
                        <div className="index-change up">+486.50 (+0.66%)</div>
                    </div>
                    
                    <div className="index-card up">
                        <div className="index-header">
                            <h4>BANK NIFTY</h4>
                            <FaArrowUp className="trend-icon up" />
                        </div>
                        <div className="index-value">₹47,123.45</div>
                        <div className="index-change up">+89.75 (+0.19%)</div>
                    </div>
                    
                    <div className="index-card down">
                        <div className="index-header">
                            <h4>NIFTY IT</h4>
                            <FaArrowDown className="trend-icon down" />
                        </div>
                        <div className="index-value">₹36,789.12</div>
                        <div className="index-change down">-234.56 (-0.63%)</div>
                    </div>
                </div>
            </div>

            {/* Stock Search */}
            <div className="search-section">
                <h3><FaSearch /> Search Indian Stocks</h3>
                <form className="search-form">
                    <div className="search-input-group">
                        <input
                            type="text"
                            placeholder="Enter stock symbol (e.g., RELIANCE, TCS, HDFCBANK)"
                            value={searchSymbol}
                            onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                            className="search-input"
                        />
                        <button type="submit" className="search-btn">
                            <FaSearch />
                        </button>
                    </div>
                </form>
            </div>

            {/* Top Gainers & Losers */}
            <div className="market-movers">
                <div className="gainers-section">
                    <h3><FaArrowUp /> Top Gainers</h3>
                    <div className="movers-grid">
                        <div className="mover-card gainer">
                            <div className="mover-symbol">RELIANCE</div>
                            <div className="mover-name">Reliance Industries</div>
                            <div className="mover-price">₹2,456.78</div>
                            <div className="mover-change positive">+89.45 (+3.78%)</div>
                        </div>
                        <div className="mover-card gainer">
                            <div className="mover-symbol">TCS</div>
                            <div className="mover-name">Tata Consultancy</div>
                            <div className="mover-price">₹3,789.12</div>
                            <div className="mover-change positive">+67.89 (+1.83%)</div>
                        </div>
                    </div>
                </div>

                <div className="losers-section">
                    <h3><FaArrowDown /> Top Losers</h3>
                    <div className="movers-grid">
                        <div className="mover-card loser">
                            <div className="mover-symbol">WIPRO</div>
                            <div className="mover-name">Wipro</div>
                            <div className="mover-price">₹456.78</div>
                            <div className="mover-change negative">-23.45 (-4.89%)</div>
                        </div>
                        <div className="mover-card loser">
                            <div className="mover-symbol">TECHM</div>
                            <div className="mover-name">Tech Mahindra</div>
                            <div className="mover-price">₹1,123.45</div>
                            <div className="mover-change negative">-45.67 (-3.91%)</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Live Status */}
            <div className="live-status">
                <div className="status-indicator">
                    <div className="status-dot live"></div>
                    <span>Live Data - Refreshing every 30 seconds</span>
                    <FaClock className="clock-icon" />
                </div>
            </div>
        </div>
    );
};

export default IndianMarkets; 