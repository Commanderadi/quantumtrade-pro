import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaSearch, FaChartLine, FaCalendarAlt, FaArrowUp, FaArrowDown, FaExclamationTriangle } from 'react-icons/fa';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './PredictiveAnalytics.css';

const MarketIntelligenceHub = () => {
    const [symbol, setSymbol] = useState('');
    const [type, setType] = useState('stock');
    const [timeframe, setTimeframe] = useState('7d');
    const [predictions, setPredictions] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [hasError, setHasError] = useState(false);

    // Memoized trend direction to prevent multiple calculations
    const trendDirection = React.useMemo(() => {
        try {
            if (!predictions || !predictions.predictions || !Array.isArray(predictions.predictions) || predictions.predictions.length < 2) {
                return 'neutral';
            }
            
            const firstPrediction = predictions.predictions[0];
            const lastPrediction = predictions.predictions[predictions.predictions.length - 1];
            
            if (!firstPrediction || !lastPrediction || typeof firstPrediction.price !== 'number' || typeof lastPrediction.price !== 'number') {
                return 'neutral';
            }
            
            const firstPrice = firstPrediction.price;
            const lastPrice = lastPrediction.price;
            
            if (lastPrice > firstPrice * 1.05) return 'up';
            if (lastPrice < firstPrice * 0.95) return 'down';
            return 'neutral';
        } catch (error) {
            console.error('Error calculating trend direction:', error);
            return 'neutral';
        }
    }, [predictions]);

    // Error boundary effect
    useEffect(() => {
        const handleError = (error) => {
            console.error('PredictiveAnalytics error caught:', error);
            setHasError(true);
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleError);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleError);
        };
    }, []);

    // Error boundary check - must come after all hooks
    if (hasError) {
        return (
            <div className="error-boundary">
                <h2>Something went wrong</h2>
                <p>Please refresh the page and try again.</p>
                <button onClick={() => setHasError(false)}>Try Again</button>
            </div>
        );
    }

    const timeframes = [
        { value: '7d', label: '7 Days' },
        { value: '30d', label: '30 Days' },
        { value: '90d', label: '90 Days' }
    ];

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
            const response = await axios.get(`/api/ai/predictions?symbol=${symbol}&type=${type}&timeframe=${timeframe}`, {
                headers: { 'x-auth-token': token }
            });
            
            // Validate the response data structure
            if (response.data && response.data.predictions && Array.isArray(response.data.predictions)) {
                setPredictions(response.data);
            } else {
                setError('Invalid data format received from server');
                console.error('Invalid predictions data structure:', response.data);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch predictions');
            console.error('Predictions error:', err);
        } finally {
            setLoading(false);
        }
    };

    const getConfidenceColor = (confidence) => {
        if (confidence >= 0.8) return 'very-high';
        if (confidence >= 0.6) return 'high';
        if (confidence >= 0.4) return 'medium';
        return 'low';
    };

    const getConfidenceLevel = (confidence) => {
        if (confidence >= 0.8) return 'Very High';
        if (confidence >= 0.6) return 'High';
        if (confidence >= 0.4) return 'Medium';
        return 'Low';
    };

    const formatChartData = (predictions) => {
        try {
            if (!predictions || !predictions.predictions || !Array.isArray(predictions.predictions)) return [];
            
            return predictions.predictions
                .filter(pred => pred && typeof pred.price === 'number' && typeof pred.confidence === 'number')
                .map((pred, index) => ({
                    day: index + 1,
                    price: pred.price,
                    confidence: pred.confidence
                }));
        } catch (error) {
            console.error('Error formatting chart data:', error);
            return [];
        }
    };

    const getTrendDirection = (predictions) => {
        if (!predictions || !predictions.predictions || !Array.isArray(predictions.predictions) || predictions.predictions.length < 2) {
            return 'neutral';
        }
        
        const firstPrediction = predictions.predictions[0];
        const lastPrediction = predictions.predictions[predictions.predictions.length - 1];
        
        if (!firstPrediction || !lastPrediction || typeof firstPrediction.price !== 'number' || typeof lastPrediction.price !== 'number') {
            return 'neutral';
        }
        
        const firstPrice = firstPrediction.price;
        const lastPrice = lastPrediction.price;
        
        if (lastPrice > firstPrice * 1.05) return 'up';
        if (lastPrice < firstPrice * 0.95) return 'down';
        return 'neutral';
    };

    const getTrendIcon = (trend) => {
        switch (trend) {
            case 'up':
                return <FaArrowUp className="trend-icon up" />;
            case 'down':
                return <FaArrowDown className="trend-icon down" />;
            default:
                return <FaChartLine className="trend-icon neutral" />;
        }
    };

    const getTrendColor = (trend) => {
        switch (trend) {
            case 'up':
                return 'up';
            case 'down':
                return 'down';
            default:
                return 'neutral';
        }
    };

    return (
        <div className="predictive-analytics">
            <div className="predictions-header">
                <h2><FaChartLine /> Market Intelligence Hub</h2>
                <p>Advanced AI-powered market analysis and predictive insights</p>
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

                    <div className="form-group">
                        <label htmlFor="timeframe">Timeframe:</label>
                        <select
                            id="timeframe"
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value)}
                            className="timeframe-select"
                        >
                            {timeframes.map(tf => (
                                <option key={tf.value} value={tf.value}>{tf.label}</option>
                            ))}
                        </select>
                    </div>
                    
                    <button type="submit" className="search-btn" disabled={loading}>
                        {loading ? 'Analyzing Markets...' : <><FaSearch /> Analyze Markets</>}
                    </button>
                </form>
            </div>

            {error && (
                <div className="error-message">
                    <FaExclamationTriangle /> {error}
                </div>
            )}

            {loading && (
                <div className="loading-message">
                    <div className="spinner"></div>
                    <p>Analyzing market data and generating intelligence insights...</p>
                </div>
            )}

            {!loading && !error && !predictions && (
                <div className="no-predictions">
                    <FaChartLine />
                    <h3>Ready for Market Analysis</h3>
                    <p>Enter a symbol above to unlock AI-powered market intelligence and predictive insights.</p>
                </div>
            )}

            {predictions && predictions.predictions && Array.isArray(predictions.predictions) && predictions.predictions.length > 0 && (
                <div className="predictions-content">
                    {/* Symbol Info */}
                    <div className="symbol-info">
                        <h3>{predictions.symbol || 'Unknown'} ({predictions.type ? predictions.type.toUpperCase() : 'UNKNOWN'})</h3>
                        <div className="prediction-meta">
                            <span className="timeframe">
                                <FaCalendarAlt /> {predictions.timeframe ? 
                                    (timeframes.find(tf => tf.value === predictions.timeframe)?.label || 'Custom') : 
                                    'Custom'} Forecast
                            </span>
                            <div className={`trend-indicator ${getTrendColor(trendDirection)}`}>
                                {getTrendIcon(trendDirection)}
                                <span>Trend: {trendDirection.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Prediction Chart */}
                    <div className="chart-section">
                        <h3>Market Trend Analysis</h3>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={400}>
                                <LineChart data={formatChartData(predictions) || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis 
                                        dataKey="day" 
                                        label={{ value: 'Days', position: 'insideBottom', offset: -10 }}
                                    />
                                    <YAxis 
                                        label={{ value: 'Price ($)', angle: -90, position: 'insideLeft' }}
                                    />
                                    <Tooltip 
                                        formatter={(value, name) => [
                                            `$${value.toFixed(2)}`, 
                                            name === 'price' ? 'Predicted Price' : 'Confidence'
                                        ]}
                                        labelFormatter={(label) => `Day ${label}`}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="price" 
                                        stroke="#007bff" 
                                        strokeWidth={3}
                                        dot={{ fill: '#007bff', strokeWidth: 2, r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Prediction Details */}
                    <div className="predictions-details">
                        <div className="details-grid">
                            {/* Confidence Level */}
                            <div className="detail-card">
                                <h4>Model Confidence</h4>
                                <div className="confidence-display">
                                    <div className={`confidence-badge ${getConfidenceColor(predictions.confidence || 0)}`}>
                                        {predictions.confidence && typeof predictions.confidence === 'number' ? 
                                            (predictions.confidence * 100).toFixed(1) : 
                                            '0.0'}%
                                    </div>
                                    <p className="confidence-level">
                                        {getConfidenceLevel(predictions.confidence || 0)} Confidence
                                    </p>
                                </div>
                            </div>

                            {/* Key Factors */}
                            <div className="detail-card">
                                <h4>Analysis Factors</h4>
                                <ul className="factors-list">
                                    {predictions.factors && Array.isArray(predictions.factors) ? 
                                        predictions.factors.map((factor, index) => (
                                            <li key={index}>{factor}</li>
                                        )) : 
                                        <li>No analysis factors available</li>
                                    }
                                </ul>
                            </div>

                            {/* Price Range */}
                            <div className="detail-card">
                                <h4>Predicted Price Range</h4>
                                <div className="price-range">
                                    <div className="range-item">
                                        <span className="range-label">Low:</span>
                                        <span className="range-value low">
                                            ${predictions.predictions && predictions.predictions.length > 0 ? 
                                                Math.min(...predictions.predictions.filter(p => p && typeof p.price === 'number').map(p => p.price)).toFixed(2) : 
                                                '0.00'}
                                        </span>
                                    </div>
                                    <div className="range-item">
                                        <span className="range-label">High:</span>
                                        <span className="range-value high">
                                            ${predictions.predictions && predictions.predictions.length > 0 ? 
                                                Math.max(...predictions.predictions.filter(p => p && typeof p.price === 'number').map(p => p.price)).toFixed(2) : 
                                                '0.00'}
                                        </span>
                                    </div>
                                    <div className="range-item">
                                        <span className="range-label">End Price:</span>
                                        <span className="range-value end">
                                            ${predictions.predictions && predictions.predictions.length > 0 && 
                                             predictions.predictions[predictions.predictions.length - 1] && 
                                             typeof predictions.predictions[predictions.predictions.length - 1].price === 'number' ? 
                                                predictions.predictions[predictions.predictions.length - 1].price.toFixed(2) : 
                                                '0.00'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Prediction Table */}
                    <div className="predictions-table-section">
                        <h3>Intelligence Report</h3>
                        <div className="predictions-table">
                            <div className="table-header">
                                <span>Period</span>
                                <span>Date</span>
                                <span>Projected Value</span>
                                <span>Confidence</span>
                            </div>
                            {predictions.predictions && Array.isArray(predictions.predictions) ? 
                                predictions.predictions
                                    .filter(prediction => prediction && typeof prediction.price === 'number' && typeof prediction.confidence === 'number')
                                    .map((prediction, index) => (
                                        <div key={index} className="table-row">
                                            <span className="day">Period {index + 1}</span>
                                            <span className="date">
                                                {new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                                            </span>
                                            <span className="price">${prediction.price.toFixed(2)}</span>
                                            <span className={`confidence ${getConfidenceColor(prediction.confidence)}`}>
                                                {(prediction.confidence * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    )) : 
                                <div className="table-row">
                                    <span colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                        No prediction data available
                                    </span>
                                </div>
                            }
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="disclaimer">
                        <FaExclamationTriangle className="disclaimer-icon" />
                        <div className="disclaimer-content">
                            <h4>Risk Disclosure & Legal Notice</h4>
                            <p>
                                This market intelligence platform provides AI-generated analysis based on historical data patterns and market indicators. 
                                All insights are for informational purposes only and should not be construed as financial advice, investment recommendations, 
                                or trading signals. Users are advised to conduct thorough research and consult with qualified financial professionals 
                                before making any investment decisions. Past performance does not guarantee future results, and all investments carry inherent risks.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketIntelligenceHub; 