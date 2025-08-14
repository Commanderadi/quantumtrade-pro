import React, { useState } from 'react';
import axios from 'axios';
import { FaSearch, FaComments, FaLightbulb, FaChartLine, FaWallet, FaHistory } from 'react-icons/fa';
import './NaturalLanguageQuery.css';

const NaturalLanguageQuery = () => {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const exampleQueries = [
        "Show me my portfolio",
        "What's my performance this month?",
        "How much did I invest in total?",
        "Show my transaction history",
        "What's my current portfolio value?",
        "How much have I gained or lost?"
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!query.trim()) {
            setError('Please enter a question');
            return;
        }

        try {
            setLoading(true);
            setError('');
            const token = localStorage.getItem('token');
            const response = await axios.post('/api/ai/query', { query }, {
                headers: { 'x-auth-token': token }
            });
            setResult(response.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to process query');
            console.error('Query error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExampleClick = (exampleQuery) => {
        setQuery(exampleQuery);
    };

    const getQueryIcon = (type) => {
        switch (type) {
            case 'portfolio':
                return <FaWallet className="query-icon" />;
            case 'performance':
                return <FaChartLine className="query-icon" />;
            case 'transaction':
                return <FaHistory className="query-icon" />;
            default:
                return <FaComments className="query-icon" />;
        }
    };

    const formatData = (data) => {
        if (!data || !Array.isArray(data)) return null;
        
        if (data.length === 0) {
            return <p className="no-data">No data available for this query.</p>;
        }

        // Check if it's portfolio data
        if (data[0] && data[0].symbol && data[0].quantity) {
            return (
                <div className="portfolio-data">
                    <h4>Your Portfolio Holdings</h4>
                    <div className="data-table">
                        <div className="table-header">
                            <span>Symbol</span>
                            <span>Type</span>
                            <span>Quantity</span>
                            <span>Current Value</span>
                        </div>
                        {data.map((holding, index) => (
                            <div key={index} className="table-row">
                                <span className="symbol">{holding.symbol}</span>
                                <span className="type">{holding.type}</span>
                                <span className="quantity">{holding.quantity}</span>
                                <span className="value">${holding.current_value?.toFixed(2) || '0.00'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // Check if it's transaction data
        if (data[0] && data[0].transaction_type) {
            return (
                <div className="transaction-data">
                    <h4>Your Transaction History</h4>
                    <div className="data-table">
                        <div className="table-header">
                            <span>Date</span>
                            <span>Symbol</span>
                            <span>Type</span>
                            <span>Quantity</span>
                            <span>Price</span>
                            <span>Total</span>
                        </div>
                        {data.slice(0, 10).map((transaction, index) => (
                            <div key={index} className="table-row">
                                <span className="date">
                                    {new Date(transaction.transaction_date).toLocaleDateString()}
                                </span>
                                <span className="symbol">{transaction.symbol}</span>
                                <span className={`type ${transaction.transaction_type}`}>
                                    {transaction.transaction_type}
                                </span>
                                <span className="quantity">{transaction.quantity}</span>
                                <span className="price">${transaction.price_per_share?.toFixed(2) || '0.00'}</span>
                                <span className="total">${transaction.total_amount?.toFixed(2) || '0.00'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // Generic data display
        return (
            <div className="generic-data">
                <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
        );
    };

    return (
        <div className="natural-language-query">
            <div className="query-header">
                <h2><FaComments /> AI Market Assistant</h2>
                <p>Ask questions about your portfolio in plain English</p>
            </div>

            {/* Query Form */}
            <div className="query-section">
                <form onSubmit={handleSubmit} className="query-form">
                    <div className="input-group">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g., Show me my portfolio performance"
                            className="query-input"
                            disabled={loading}
                        />
                        <button type="submit" className="query-btn" disabled={loading}>
                            {loading ? 'Processing...' : <><FaSearch /> Ask</>}
                        </button>
                    </div>
                </form>
            </div>

            {/* Example Queries */}
            <div className="examples-section">
                <h3><FaLightbulb /> Try these examples:</h3>
                <div className="examples-grid">
                    {exampleQueries.map((example, index) => (
                        <button
                            key={index}
                            onClick={() => handleExampleClick(example)}
                            className="example-btn"
                            disabled={loading}
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="error-message">
                    <FaComments /> {error}
                </div>
            )}

            {result && (
                <div className="result-section">
                    <div className="result-header">
                        <h3>Query Result</h3>
                        <div className="query-info">
                            <div className="original-query">
                                <strong>Your Question:</strong> "{result.originalQuery}"
                            </div>
                            <div className="parsed-query">
                                <strong>Interpreted as:</strong> {result.parsedQuery.type} - {result.parsedQuery.action}
                            </div>
                        </div>
                    </div>

                    <div className="result-content">
                        <div className="result-message">
                            {getQueryIcon(result.parsedQuery.type)}
                            <span>{result.result.message}</span>
                        </div>
                        
                        {result.result.data && (
                            <div className="result-data">
                                {formatData(result.result.data)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NaturalLanguageQuery; 