import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaLightbulb, FaExclamationTriangle, FaInfoCircle, FaCheckCircle, FaChartLine, FaShieldAlt } from 'react-icons/fa';
import './AIInsights.css';

const AIInsights = () => {
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchInsights();
    }, []);

    const fetchInsights = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await axios.get('/api/ai/insights', {
                headers: { 'x-auth-token': token }
            });
            setInsights(response.data);
        } catch (err) {
            setError('Failed to fetch AI insights');
            console.error('AI insights error:', err);
        } finally {
            setLoading(false);
        }
    };

    const getInsightIcon = (type) => {
        switch (type) {
            case 'positive':
                return <FaCheckCircle className="insight-icon positive" />;
            case 'warning':
                return <FaExclamationTriangle className="insight-icon warning" />;
            case 'info':
                return <FaInfoCircle className="insight-icon info" />;
            default:
                return <FaLightbulb className="insight-icon" />;
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high':
                return 'high-priority';
            case 'medium':
                return 'medium-priority';
            case 'low':
                return 'low-priority';
            default:
                return '';
        }
    };

    if (loading) {
        return (
            <div className="ai-insights">
                <div className="insights-header">
                    <h2><FaLightbulb /> AI Portfolio Insights</h2>
                </div>
                <div className="loading">Loading AI insights...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="ai-insights">
                <div className="insights-header">
                    <h2><FaLightbulb /> AI Portfolio Insights</h2>
                </div>
                <div className="error">{error}</div>
            </div>
        );
    }

    return (
        <div className="ai-insights">
            <div className="insights-header">
                <h2><FaLightbulb /> AI Portfolio Insights</h2>
                <button onClick={fetchInsights} className="refresh-btn">
                    Refresh Insights
                </button>
            </div>

            {insights && (
                <>
                    {/* Portfolio Metrics */}
                    <div className="metrics-section">
                        <h3><FaChartLine /> Portfolio Overview</h3>
                        <div className="metrics-grid">
                            <div className="metric-card">
                                <div className="metric-label">Total Value</div>
                                <div className="metric-value">${insights.portfolioMetrics.totalValue.toLocaleString()}</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-label">Total Cost</div>
                                <div className="metric-value">${insights.portfolioMetrics.totalCost.toLocaleString()}</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-label">Total Gain/Loss</div>
                                <div className={`metric-value ${insights.portfolioMetrics.totalGainLoss >= 0 ? 'positive' : 'negative'}`}>
                                    ${insights.portfolioMetrics.totalGainLoss.toLocaleString()}
                                </div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-label">Return %</div>
                                <div className={`metric-value ${insights.portfolioMetrics.totalGainLossPercent >= 0 ? 'positive' : 'negative'}`}>
                                    {insights.portfolioMetrics.totalGainLossPercent.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Insights */}
                    <div className="insights-section">
                        <h3><FaLightbulb /> AI-Powered Analytics</h3>
                        {insights.insights.length > 0 ? (
                            <div className="insights-grid">
                                {insights.insights.map((insight, index) => (
                                    <div key={index} className={`insight-card ${getPriorityColor(insight.priority)}`}>
                                        <div className="insight-header">
                                            {getInsightIcon(insight.type)}
                                            <h4>{insight.title}</h4>
                                            <span className={`priority-badge ${insight.priority}`}>
                                                {insight.priority}
                                            </span>
                                        </div>
                                        <p>{insight.message}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="no-insights">No specific insights at this time. Your portfolio looks well-balanced!</p>
                        )}
                    </div>

                    {/* Recommendations */}
                    <div className="recommendations-section">
                        <h3><FaCheckCircle /> AI Recommendations</h3>
                        {insights.recommendations.length > 0 ? (
                            <div className="recommendations-grid">
                                {insights.recommendations.map((rec, index) => (
                                    <div key={index} className={`recommendation-card ${getPriorityColor(rec.priority)}`}>
                                        <div className="recommendation-header">
                                            <h4>{rec.title}</h4>
                                            <span className={`priority-badge ${rec.priority}`}>
                                                {rec.priority}
                                            </span>
                                        </div>
                                        <p>{rec.description}</p>
                                        <div className="recommendation-action">
                                            <strong>Action:</strong> {rec.action}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="no-recommendations">No specific recommendations at this time.</p>
                        )}
                    </div>

                    {/* Risk Analysis */}
                    <div className="risk-section">
                        <h3><FaShieldAlt /> Risk Analysis</h3>
                        <div className="risk-overview">
                            <div className="risk-level">
                                <span className="risk-label">Overall Risk Level:</span>
                                <span className={`risk-badge ${insights.riskAnalysis.overallRisk}`}>
                                    {insights.riskAnalysis.overallRisk.toUpperCase()}
                                </span>
                            </div>
                            <div className="volatility-risk">
                                <span className="risk-label">Volatility Risk:</span>
                                <span className={`risk-badge ${insights.riskAnalysis.volatilityRisk}`}>
                                    {insights.riskAnalysis.volatilityRisk.toUpperCase()}
                                </span>
                            </div>
                        </div>
                        
                        {insights.riskAnalysis.concentrationRisk.length > 0 && (
                            <div className="concentration-risk">
                                <h4>Concentration Risk</h4>
                                <div className="concentration-list">
                                    {insights.riskAnalysis.concentrationRisk.map((risk, index) => (
                                        <div key={index} className="concentration-item">
                                            <span className="symbol">{risk.symbol}</span>
                                            <span className="percentage">{risk.percentage.toFixed(1)}%</span>
                                            <span className={`risk-level ${risk.risk}`}>{risk.risk}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <div className="risk-recommendation">
                            <strong>Risk Recommendation:</strong> {insights.riskAnalysis.recommendations}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AIInsights; 