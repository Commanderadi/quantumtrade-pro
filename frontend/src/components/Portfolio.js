import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus, FaChartLine, FaBitcoin, FaDollarSign, FaWallet } from 'react-icons/fa';
import PortfolioAnalytics from './PortfolioAnalytics';
import './Portfolio.css';

const Portfolio = () => {
    const [portfolio, setPortfolio] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showTransactionForm, setShowTransactionForm] = useState(false);
    const [transactionForm, setTransactionForm] = useState({
        symbol: '',
        type: 'stock',
        transaction_type: 'buy',
        quantity: '',
        price_per_unit: ''
    });

    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return { headers: { 'x-auth-token': token } };
    };

    useEffect(() => {
        fetchPortfolioData();
    }, []);

    const fetchPortfolioData = async () => {
        try {
            const [portfolioRes, transactionsRes, summaryRes] = await Promise.all([
                axios.get('/api/portfolio', getAuthHeaders()),
                axios.get('/api/portfolio/transactions', getAuthHeaders()),
                axios.get('/api/portfolio/summary', getAuthHeaders())
            ]);

            setPortfolio(portfolioRes.data);
            setTransactions(transactionsRes.data);
            setSummary(summaryRes.data);
        } catch (error) {
            console.error('Failed to fetch portfolio data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleTransactionSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/portfolio/transaction', transactionForm, getAuthHeaders());
            setTransactionForm({
                symbol: '',
                type: 'stock',
                transaction_type: 'buy',
                quantity: '',
                price_per_unit: ''
            });
            setShowTransactionForm(false);
            fetchPortfolioData(); // Refresh data
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to add transaction');
        }
    };

    const handleInputChange = (e) => {
        setTransactionForm({
            ...transactionForm,
            [e.target.name]: e.target.value
        });
    };

    if (loading) {
        return <div className="loading">Loading portfolio...</div>;
    }

    return (
        <div className="portfolio">
            <div className="portfolio-header">
                                    <h2><FaWallet /> Investment Holdings</h2>
                <button 
                    onClick={() => setShowTransactionForm(!showTransactionForm)}
                    className="add-transaction-btn"
                >
                    <FaPlus /> Add Transaction
                </button>
            </div>

            {/* Portfolio Summary */}
            {summary && (
                <div className="portfolio-summary">
                    <div className="summary-card">
                        <h3>Total Holdings</h3>
                        <p>{summary.totalHoldings}</p>
                    </div>
                    <div className="summary-card">
                        <h3>Total Invested</h3>
                        <p>${summary.totalInvested}</p>
                    </div>
                    <div className="summary-card">
                        <h3>Current Value</h3>
                        <p>${summary.totalCurrentValue}</p>
                    </div>
                    <div className="summary-card">
                        <h3>Total Gain/Loss</h3>
                        <p className={parseFloat(summary.totalGainLoss) >= 0 ? 'positive' : 'negative'}>
                            ${summary.totalGainLoss} ({summary.totalGainLossPercent}%)
                        </p>
                    </div>
                </div>
            )}

            {/* Add Transaction Form */}
            {showTransactionForm && (
                <div className="transaction-form-container">
                    <form onSubmit={handleTransactionSubmit} className="transaction-form">
                        <h3>Add Transaction</h3>
                        <div className="form-row">
                            <input
                                name="symbol"
                                type="text"
                                placeholder="Symbol (e.g., AAPL)"
                                value={transactionForm.symbol}
                                onChange={handleInputChange}
                                required
                            />
                            <select
                                name="type"
                                value={transactionForm.type}
                                onChange={handleInputChange}
                            >
                                <option value="stock">Stock</option>
                                <option value="crypto">Crypto</option>
                            </select>
                        </div>
                        <div className="form-row">
                            <select
                                name="transaction_type"
                                value={transactionForm.transaction_type}
                                onChange={handleInputChange}
                            >
                                <option value="buy">Buy</option>
                                <option value="sell">Sell</option>
                            </select>
                            <input
                                name="quantity"
                                type="number"
                                step="0.00000001"
                                placeholder="Quantity"
                                value={transactionForm.quantity}
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                        <div className="form-row">
                            <input
                                name="price_per_unit"
                                type="number"
                                step="0.01"
                                placeholder="Price per unit"
                                value={transactionForm.price_per_unit}
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="submit-btn">Add Transaction</button>
                            <button 
                                type="button" 
                                onClick={() => setShowTransactionForm(false)}
                                className="cancel-btn"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Portfolio Holdings */}
            <div className="portfolio-holdings">
                <h3>Current Holdings</h3>
                {portfolio.length > 0 ? (
                    <div className="holdings-grid">
                        {portfolio.map((holding) => (
                            <div key={`${holding.symbol}-${holding.type}`} className="holding-card">
                                <div className="holding-header">
                                    <span className="holding-symbol">{holding.symbol}</span>
                                    <span className="holding-type">
                                        {holding.type === 'stock' ? <FaChartLine /> : <FaBitcoin />}
                                        {holding.type}
                                    </span>
                                </div>
                                <div className="holding-details">
                                    <p><strong>Quantity:</strong> {parseFloat(holding.quantity).toFixed(8)}</p>
                                    <p><strong>Avg Price:</strong> ${parseFloat(holding.average_price).toFixed(2)}</p>
                                    <p><strong>Total Invested:</strong> ${(parseFloat(holding.quantity) * parseFloat(holding.average_price)).toFixed(2)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p>No holdings yet. Add your first transaction to get started!</p>
                )}
            </div>

            {/* Transaction History */}
            <div className="transaction-history">
                <h3>Transaction History</h3>
                {transactions.length > 0 ? (
                    <div className="transactions-list">
                        {transactions.map((transaction) => (
                            <div key={transaction.id} className="transaction-item">
                                <div className="transaction-header">
                                    <span className="transaction-symbol">{transaction.symbol}</span>
                                    <span className={`transaction-type ${transaction.transaction_type}`}>
                                        {transaction.transaction_type.toUpperCase()}
                                    </span>
                                </div>
                                <div className="transaction-details">
                                    <p>{parseFloat(transaction.quantity).toFixed(8)} @ ${parseFloat(transaction.price_per_unit).toFixed(2)}</p>
                                    <p><strong>Total:</strong> ${parseFloat(transaction.total_amount).toFixed(2)}</p>
                                    <p className="transaction-date">
                                        {new Date(transaction.transaction_date).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p>No transactions yet.</p>
                )}
            </div>

            {/* Portfolio Analytics */}
            <PortfolioAnalytics portfolio={portfolio} transactions={transactions} />
        </div>
    );
};

export default Portfolio; 