import React, { useState } from 'react';
import axios from 'axios';
import { FaSearch, FaSmile, FaFrown, FaMeh, FaChartLine, FaNewspaper, FaTwitter } from 'react-icons/fa';
import './SentimentAnalysis.css';

const SentimentAnalysis = () => {
    const [symbol, setSymbol] = useState('');
    const [type, setType] = useState('stock');
    const [sentiment, setSentiment] = useState(null);
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
            const response = await axios.get(`/api/ai/sentiment?symbol=${symbol}&type=${type}`, {
                headers: { 'x-auth-token': token }
            });
            setSentiment(response.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch sentiment analysis');
            console.error('Sentiment analysis error:', err);
        } finally {
            setLoading(false);
        }
    };

    const getSentimentIcon = (sentiment) => {
        switch (sentiment) {
            case 'bullish':
            case 'positive':
                return <FaSmile className="sentiment-icon bullish" />;
            case 'bearish':
            case 'negative':
                return <FaFrown className="sentiment-icon bearish" />;
            case 'neutral':
                return <FaMeh className="sentiment-icon neutral" />;
            default:
                return <FaMeh className="sentiment-icon neutral" />;
        }
    };

    const getSentimentColor = (sentiment) => {
        switch (sentiment) {
            case 'bullish':
            case 'positive':
                return 'bullish';
            case 'bearish':
            case 'negative':
                return 'bearish';
            case 'neutral':
                return 'neutral';
            default:
                return 'neutral';
        }
    };

    const getConfidenceLevel = (confidence) => {
        if (confidence >= 0.8) return 'Very High';
        if (confidence >= 0.6) return 'High';
        if (confidence >= 0.4) return 'Medium';
        return 'Low';
    };

    const getConfidenceColor = (confidence) => {
        if (confidence >= 0.8) return 'very-high';
        if (confidence >= 0.6) return 'high';
        if (confidence >= 0.4) return 'medium';
        return 'low';
    };

    return (
        <div className="sentiment-analysis">
            <div className="sentiment-header">
                <h2><FaChartLine /> Market Sentiment Analysis</h2>
                <p>Analyze market sentiment for stocks and cryptocurrencies</p>
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
                        {loading ? 'Analyzing...' : <><FaSearch /> Analyze Sentiment</>}
                    </button>
                </form>
            </div>

            {error && (
                <div className="error-message">
                    <FaChartLine /> {error}
                </div>
            )}

            {sentiment && (
                <div className="sentiment-content">
                    {/* Symbol Info */}
                    <div className="symbol-info">
                        <h3>{sentiment.symbol} ({sentiment.type.toUpperCase()})</h3>
                        <div className="overall-sentiment">
                            <span className="sentiment-label">Overall Sentiment:</span>
                            <div className={`sentiment-display ${getSentimentColor(sentiment.overallSentiment)}`}>
                                {getSentimentIcon(sentiment.overallSentiment)}
                                <span className="sentiment-text">{sentiment.overallSentiment.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Sentiment Breakdown */}
                    <div className="sentiment-breakdown">
                        <h3>Sentiment Breakdown</h3>
                        <div className="breakdown-grid">
                            {/* Technical Sentiment */}
                            <div className="sentiment-card">
                                <div className="sentiment-card-header">
                                    <FaChartLine className="card-icon" />
                                    <h4>Technical Analysis</h4>
                                </div>
                                <div className="sentiment-details">
                                    <div className={`sentiment-badge ${getSentimentColor(sentiment.breakdown.technical.sentiment)}`}>
                                        {getSentimentIcon(sentiment.breakdown.technical.sentiment)}
                                        {sentiment.breakdown.technical.sentiment}
                                    </div>
                                    <div className="confidence-meter">
                                        <span className="confidence-label">Confidence:</span>
                                        <div className="confidence-bar">
                                            <div 
                                                className={`confidence-fill ${getConfidenceColor(sentiment.breakdown.technical.confidence)}`}
                                                style={{ width: `${sentiment.breakdown.technical.confidence * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="confidence-value">
                                            {getConfidenceLevel(sentiment.breakdown.technical.confidence)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* News Sentiment */}
                            <div className="sentiment-card">
                                <div className="sentiment-card-header">
                                    <FaNewspaper className="card-icon" />
                                    <h4>News Sentiment</h4>
                                </div>
                                <div className="sentiment-details">
                                    <div className={`sentiment-badge ${getSentimentColor(sentiment.breakdown.news.sentiment)}`}>
                                        {getSentimentIcon(sentiment.breakdown.news.sentiment)}
                                        {sentiment.breakdown.news.sentiment}
                                    </div>
                                    <div className="confidence-meter">
                                        <span className="confidence-label">Confidence:</span>
                                        <div className="confidence-bar">
                                            <div 
                                                className={`confidence-fill ${getConfidenceColor(sentiment.breakdown.news.confidence)}`}
                                                style={{ width: `${sentiment.breakdown.news.confidence * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="confidence-value">
                                            {getConfidenceLevel(sentiment.breakdown.news.confidence)}
                                        </span>
                                    </div>
                                    <div className="news-count">
                                        Recent News Articles: {sentiment.breakdown.news.recentNews}
                                    </div>
                                </div>
                            </div>

                            {/* Social Sentiment */}
                            <div className="sentiment-card">
                                <div className="sentiment-card-header">
                                    <FaTwitter className="card-icon" />
                                    <h4>Social Media</h4>
                                </div>
                                <div className="sentiment-details">
                                    <div className={`sentiment-badge ${getSentimentColor(sentiment.breakdown.social.sentiment)}`}>
                                        {getSentimentIcon(sentiment.breakdown.social.sentiment)}
                                        {sentiment.breakdown.social.sentiment}
                                    </div>
                                    <div className="confidence-meter">
                                        <span className="confidence-label">Confidence:</span>
                                        <div className="confidence-bar">
                                            <div 
                                                className={`confidence-fill ${getConfidenceColor(sentiment.breakdown.social.confidence)}`}
                                                style={{ width: `${sentiment.breakdown.social.confidence * 100}%` }}
                                            ></div>
                                        </div>
                                        <span className="confidence-value">
                                            {getConfidenceLevel(sentiment.breakdown.social.confidence)}
                                        </span>
                                    </div>
                                    <div className="social-mentions">
                                        Social Mentions: {sentiment.breakdown.social.mentions.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Overall Confidence */}
                    <div className="overall-confidence">
                        <h3>Overall Analysis Confidence</h3>
                        <div className="confidence-display">
                            <div className="confidence-bar-large">
                                <div 
                                    className={`confidence-fill-large ${getConfidenceColor(sentiment.confidence)}`}
                                    style={{ width: `${sentiment.confidence * 100}%` }}
                                ></div>
                            </div>
                            <div className="confidence-text">
                                <span className="confidence-percentage">
                                    {(sentiment.confidence * 100).toFixed(1)}%
                                </span>
                                <span className="confidence-level">
                                    {getConfidenceLevel(sentiment.confidence)} Confidence
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Recommendations */}
                    <div className="recommendations-section">
                        <h3>AI Recommendations</h3>
                        <div className="recommendation-card">
                            <div className="recommendation-content">
                                <div className="recommendation-icon">
                                    {getSentimentIcon(sentiment.overallSentiment)}
                                </div>
                                <div className="recommendation-text">
                                    <h4>Market Recommendation</h4>
                                    <p>{sentiment.recommendations}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SentimentAnalysis; 