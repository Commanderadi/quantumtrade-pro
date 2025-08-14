const pool = require('../config/database');
const axios = require('axios');

// AI-powered portfolio insights and recommendations
exports.getPortfolioInsights = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Get user's portfolio data
        const [portfolioRows] = await pool.execute(
            'SELECT * FROM portfolios WHERE user_id = ?',
            [userId]
        );
        
        const [transactionRows] = await pool.execute(
            'SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC',
            [userId]
        );
        
        // Calculate portfolio metrics
        const totalValue = portfolioRows.reduce((sum, holding) => sum + (holding.current_value || 0), 0);
        const totalCost = portfolioRows.reduce((sum, holding) => sum + (holding.total_cost || 0), 0);
        const totalGainLoss = totalValue - totalCost;
        const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
        
        // Generate AI insights
        const insights = generateAIInsights(portfolioRows, transactionRows, totalGainLossPercent);
        
        // Generate recommendations
        const recommendations = generateRecommendations(portfolioRows, totalGainLossPercent);
        
        // Risk analysis
        const riskAnalysis = analyzeRisk(portfolioRows);
        
        res.json({
            insights,
            recommendations,
            riskAnalysis,
            portfolioMetrics: {
                totalValue,
                totalCost,
                totalGainLoss,
                totalGainLossPercent
            }
        });
    } catch (error) {
        console.error('Error getting portfolio insights:', error);
        res.status(500).json({ message: 'Failed to get portfolio insights' });
    }
};

// Automated trading signals
exports.getTradingSignals = async (req, res) => {
    try {
        const { symbol, type = 'stock' } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ message: 'Symbol is required' });
        }
        
        // Get current price data
        let currentPrice = 0;
        let priceData = [];
        
        if (type === 'stock') {
            try {
                const response = await axios.get(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`);
                if (response.data['Time Series (Daily)']) {
                    const timeSeries = response.data['Time Series (Daily)'];
                    const dates = Object.keys(timeSeries).slice(0, 30); // Last 30 days
                    priceData = dates.map(date => ({
                        date,
                        close: parseFloat(timeSeries[date]['4. close'])
                    }));
                    currentPrice = priceData[0].close;
                }
            } catch (error) {
                console.error('Error fetching stock data:', error);
            }
        } else {
            try {
                const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/market_chart?vs_currency=usd&days=30`);
                if (response.data.prices) {
                    priceData = response.data.prices.map(([timestamp, price]) => ({
                        date: new Date(timestamp).toISOString().split('T')[0],
                        close: price
                    }));
                    currentPrice = priceData[priceData.length - 1].close;
                }
            } catch (error) {
                console.error('Error fetching crypto data:', error);
            }
        }
        
        if (priceData.length === 0) {
            return res.status(404).json({ message: 'Price data not available' });
        }
        
        // Generate trading signals using technical analysis
        const signals = generateTradingSignals(priceData, currentPrice);
        
        res.json({
            symbol,
            type,
            currentPrice,
            signals,
            priceData: priceData.slice(0, 10) // Return last 10 days
        });
    } catch (error) {
        console.error('Error getting trading signals:', error);
        res.status(500).json({ message: 'Failed to get trading signals' });
    }
};

// Market sentiment analysis
exports.getSentimentAnalysis = async (req, res) => {
    try {
        const { symbol, type = 'stock' } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ message: 'Symbol is required' });
        }
        
        // Mock sentiment analysis (in a real implementation, you'd use NLP APIs)
        const sentiment = generateSentimentAnalysis(symbol, type);
        
        // Get news sentiment
        const newsSentiment = await getNewsSentiment(symbol, type);
        
        // Social media sentiment (mock)
        const socialSentiment = generateSocialSentiment(symbol);
        
        res.json({
            symbol,
            type,
            overallSentiment: sentiment.overall,
            breakdown: {
                technical: sentiment.technical,
                news: newsSentiment,
                social: socialSentiment
            },
            confidence: sentiment.confidence,
            recommendations: sentiment.recommendations
        });
    } catch (error) {
        console.error('Error getting sentiment analysis:', error);
        res.status(500).json({ message: 'Failed to get sentiment analysis' });
    }
};

// Natural language queries
exports.processNaturalLanguageQuery = async (req, res) => {
    try {
        const { query } = req.body;
        const userId = req.user.userId;
        
        if (!query) {
            return res.status(400).json({ message: 'Query is required' });
        }
        
        // Parse natural language query
        const parsedQuery = parseNaturalLanguageQuery(query);
        
        // Execute query based on parsed intent
        const result = await executeNaturalLanguageQuery(parsedQuery, userId);
        
        res.json({
            originalQuery: query,
            parsedQuery,
            result
        });
    } catch (error) {
        console.error('Error processing natural language query:', error);
        res.status(500).json({ message: 'Failed to process query' });
    }
};

// Predictive analytics
exports.getPredictions = async (req, res) => {
    try {
        const { symbol, type = 'stock', timeframe = '7d' } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ message: 'Symbol is required' });
        }
        
        // Get historical data for prediction
        const historicalData = await getHistoricalData(symbol, type);
        
        if (historicalData.length === 0) {
            return res.status(404).json({ message: 'Historical data not available' });
        }
        
        // Generate predictions using ML models
        const predictions = generatePredictions(historicalData, timeframe);
        
        res.json({
            symbol,
            type,
            timeframe,
            predictions,
            confidence: predictions.confidence,
            factors: predictions.factors
        });
    } catch (error) {
        console.error('Error getting predictions:', error);
        res.status(500).json({ message: 'Failed to get predictions' });
    }
};

// Helper functions
function generateAIInsights(portfolio, transactions, gainLossPercent) {
    const insights = [];
    
    // Portfolio performance insights
    if (gainLossPercent > 10) {
        insights.push({
            type: 'positive',
            title: 'Strong Portfolio Performance',
            message: `Your portfolio is performing exceptionally well with a ${gainLossPercent.toFixed(2)}% return. Consider rebalancing to lock in gains.`,
            priority: 'high'
        });
    } else if (gainLossPercent < -10) {
        insights.push({
            type: 'warning',
            title: 'Portfolio Underperforming',
            message: `Your portfolio is down ${Math.abs(gainLossPercent).toFixed(2)}%. Consider reviewing your strategy or diversifying.`,
            priority: 'high'
        });
    }
    
    // Diversification insights
    const assetTypes = [...new Set(portfolio.map(p => p.type))];
    if (assetTypes.length < 2) {
        insights.push({
            type: 'info',
            title: 'Limited Diversification',
            message: 'Your portfolio is concentrated in one asset type. Consider adding different asset classes for better risk management.',
            priority: 'medium'
        });
    }
    
    // Trading frequency insights
    const recentTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.transaction_date);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return transactionDate > thirtyDaysAgo;
    });
    
    if (recentTransactions.length > 10) {
        insights.push({
            type: 'warning',
            title: 'High Trading Frequency',
            message: 'You\'ve made many recent trades. Consider a more long-term approach to reduce transaction costs.',
            priority: 'medium'
        });
    }
    
    return insights;
}

function generateRecommendations(portfolio, gainLossPercent) {
    const recommendations = [];
    
    // Rebalancing recommendations
    if (Math.abs(gainLossPercent) > 15) {
        recommendations.push({
            type: 'rebalancing',
            title: 'Portfolio Rebalancing',
            description: 'Consider rebalancing your portfolio to maintain your target asset allocation.',
            priority: 'high',
            action: 'Review and adjust holdings'
        });
    }
    
    // Diversification recommendations
    const stockHoldings = portfolio.filter(p => p.type === 'stock');
    const cryptoHoldings = portfolio.filter(p => p.type === 'crypto');
    
    if (stockHoldings.length === 0) {
        recommendations.push({
            type: 'diversification',
            title: 'Add Stocks to Portfolio',
            description: 'Consider adding some blue-chip stocks for stability and dividends.',
            priority: 'medium',
            action: 'Research and add stocks'
        });
    }
    
    if (cryptoHoldings.length === 0) {
        recommendations.push({
            type: 'diversification',
            title: 'Consider Cryptocurrency',
            description: 'Adding some cryptocurrency could provide growth potential and diversification.',
            priority: 'low',
            action: 'Research crypto options'
        });
    }
    
    return recommendations;
}

function analyzeRisk(portfolio) {
    const totalValue = portfolio.reduce((sum, holding) => sum + (holding.current_value || 0), 0);
    
    // Calculate concentration risk
    const concentrationRisk = portfolio.map(holding => ({
        symbol: holding.symbol,
        percentage: totalValue > 0 ? (holding.current_value / totalValue) * 100 : 0,
        risk: 'high'
    })).filter(item => item.percentage > 20);
    
    // Calculate volatility risk (mock)
    const volatilityRisk = portfolio.length > 0 ? 'medium' : 'low';
    
    return {
        concentrationRisk,
        volatilityRisk,
        overallRisk: concentrationRisk.length > 0 ? 'high' : volatilityRisk,
        recommendations: concentrationRisk.length > 0 ? 
            'Consider reducing positions in concentrated holdings' : 
            'Portfolio risk appears well-managed'
    };
}

function generateTradingSignals(priceData, currentPrice) {
    if (priceData.length < 14) {
        return { message: 'Insufficient data for analysis' };
    }
    
    // Calculate moving averages
    const sma20 = priceData.slice(0, 20).reduce((sum, data) => sum + data.close, 0) / 20;
    const sma50 = priceData.slice(0, 50).reduce((sum, data) => sum + data.close, 0) / Math.min(50, priceData.length);
    
    // Calculate RSI (simplified)
    const gains = [];
    const losses = [];
    for (let i = 1; i < Math.min(14, priceData.length); i++) {
        const change = priceData[i-1].close - priceData[i].close;
        if (change > 0) {
            gains.push(change);
            losses.push(0);
        } else {
            gains.push(0);
            losses.push(Math.abs(change));
        }
    }
    
    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    // Generate signals
    const signals = [];
    
    if (currentPrice > sma20 && sma20 > sma50) {
        signals.push({
            type: 'buy',
            strength: 'strong',
            reason: 'Price above moving averages, bullish trend'
        });
    } else if (currentPrice < sma20 && sma20 < sma50) {
        signals.push({
            type: 'sell',
            strength: 'strong',
            reason: 'Price below moving averages, bearish trend'
        });
    }
    
    if (rsi < 30) {
        signals.push({
            type: 'buy',
            strength: 'medium',
            reason: 'Oversold conditions (RSI < 30)'
        });
    } else if (rsi > 70) {
        signals.push({
            type: 'sell',
            strength: 'medium',
            reason: 'Overbought conditions (RSI > 70)'
        });
    }
    
    return {
        signals,
        indicators: {
            sma20,
            sma50,
            rsi: rsi.toFixed(2),
            currentPrice
        }
    };
}

function generateSentimentAnalysis(symbol, type) {
    // Mock sentiment analysis
    const sentiments = ['bullish', 'bearish', 'neutral'];
    const overall = sentiments[Math.floor(Math.random() * sentiments.length)];
    
    return {
        overall,
        technical: {
            sentiment: overall,
            confidence: Math.random() * 0.4 + 0.6 // 60-100%
        },
        confidence: Math.random() * 0.3 + 0.7, // 70-100%
        recommendations: overall === 'bullish' ? 
            'Consider buying or holding' : 
            overall === 'bearish' ? 
            'Consider selling or waiting' : 
            'Monitor for clearer signals'
    };
}

async function getNewsSentiment(symbol, type) {
    // Mock news sentiment
    return {
        sentiment: ['positive', 'negative', 'neutral'][Math.floor(Math.random() * 3)],
        confidence: Math.random() * 0.4 + 0.6,
        recentNews: Math.floor(Math.random() * 10) + 1
    };
}

function generateSocialSentiment(symbol) {
    // Mock social media sentiment
    return {
        sentiment: ['positive', 'negative', 'neutral'][Math.floor(Math.random() * 3)],
        confidence: Math.random() * 0.3 + 0.5,
        mentions: Math.floor(Math.random() * 1000) + 100
    };
}

function parseNaturalLanguageQuery(query) {
    const lowerQuery = query.toLowerCase();
    
    // Parse different types of queries
    if (lowerQuery.includes('portfolio') || lowerQuery.includes('holdings')) {
        return { type: 'portfolio', action: 'get' };
    }
    
    if (lowerQuery.includes('performance') || lowerQuery.includes('return')) {
        return { type: 'performance', action: 'analyze' };
    }
    
    if (lowerQuery.includes('buy') || lowerQuery.includes('purchase')) {
        return { type: 'transaction', action: 'buy' };
    }
    
    if (lowerQuery.includes('sell')) {
        return { type: 'transaction', action: 'sell' };
    }
    
    if (lowerQuery.includes('price') || lowerQuery.includes('value')) {
        return { type: 'price', action: 'get' };
    }
    
    return { type: 'general', action: 'search' };
}

async function executeNaturalLanguageQuery(parsedQuery, userId) {
    switch (parsedQuery.type) {
        case 'portfolio':
            const [portfolio] = await pool.execute(
                'SELECT * FROM portfolios WHERE user_id = ?',
                [userId]
            );
            return { data: portfolio, message: 'Here is your current portfolio' };
            
        case 'performance':
            const [transactions] = await pool.execute(
                'SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC',
                [userId]
            );
            return { data: transactions, message: 'Here is your transaction history' };
            
        default:
            return { message: 'I understand you\'re asking about your portfolio. Please be more specific.' };
    }
}

async function getHistoricalData(symbol, type) {
    // Mock historical data
    const days = 30;
    const data = [];
    let basePrice = type === 'stock' ? 100 : 50000;
    
    for (let i = days; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const randomChange = (Math.random() - 0.5) * 0.1; // ±5% daily change
        basePrice *= (1 + randomChange);
        
        data.push({
            date: date.toISOString().split('T')[0],
            close: basePrice,
            volume: Math.floor(Math.random() * 1000000) + 100000
        });
    }
    
    return data;
}

function generatePredictions(historicalData, timeframe) {
    const currentPrice = historicalData[historicalData.length - 1].close;
    
    // Simple linear regression for prediction
    const n = historicalData.length;
    const xValues = Array.from({length: n}, (_, i) => i);
    const yValues = historicalData.map(d => d.close);
    
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict future prices
    const daysToPredict = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 7;
    const predictions = [];
    
    for (let i = 1; i <= daysToPredict; i++) {
        const predictedPrice = slope * (n + i) + intercept;
        predictions.push({
            date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            price: Math.max(0, predictedPrice),
            confidence: Math.max(0.5, 1 - (i * 0.02)) // Decreasing confidence over time
        });
    }
    
    return {
        predictions,
        confidence: 0.75,
        factors: ['Technical analysis', 'Price momentum', 'Market trends']
    };
} 