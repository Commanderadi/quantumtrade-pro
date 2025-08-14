const express = require('express');
const router = express.Router();
const axios = require('axios');

// Alpha Vantage API configuration
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// Get historical stock data
router.get('/historical/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { timeframe = 'daily' } = req.query;

        // Map timeframe to Alpha Vantage function
        let function_name = 'TIME_SERIES_DAILY';
        let interval = '';
        
        switch (timeframe) {
            case '1min':
                function_name = 'TIME_SERIES_INTRADAY';
                interval = '1min';
                break;
            case '5min':
                function_name = 'TIME_SERIES_INTRADAY';
                interval = '5min';
                break;
            case '15min':
                function_name = 'TIME_SERIES_INTRADAY';
                interval = '15min';
                break;
            case 'hourly':
                function_name = 'TIME_SERIES_INTRADAY';
                interval = '60min';
                break;
            case 'daily':
            default:
                function_name = 'TIME_SERIES_DAILY';
                break;
        }

        // Build API URL
        let url = `${ALPHA_VANTAGE_BASE_URL}?function=${function_name}&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        if (interval) {
            url += `&interval=${interval}`;
        }

        // Fetch data from Alpha Vantage
        const response = await axios.get(url);
        const data = response.data;

        // Check for API errors
        if (data['Error Message']) {
            return res.status(400).json({ error: data['Error Message'] });
        }

        if (data['Note']) {
            // API limit reached, return mock data
            return res.json({
                symbol,
                timeframe,
                prices: generateMockStockData(symbol, timeframe),
                note: 'Using mock data due to API limit'
            });
        }

        // Parse the response based on function
        let timeSeriesKey = '';
        if (function_name === 'TIME_SERIES_INTRADAY') {
            timeSeriesKey = `Time Series (${interval})`;
        } else {
            timeSeriesKey = 'Time Series (Daily)';
        }

        const timeSeries = data[timeSeriesKey];
        if (!timeSeries) {
            return res.status(400).json({ error: 'No data available for this symbol/timeframe' });
        }

        // Convert to our format
        const prices = Object.entries(timeSeries)
            .map(([timestamp, values]) => ({
                timestamp: new Date(timestamp),
                price: parseFloat(values['4. close']),
                volume: parseInt(values['5. volume']),
                open: parseFloat(values['1. open']),
                high: parseFloat(values['2. high']),
                low: parseFloat(values['3. low'])
            }))
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-100); // Last 100 data points

        res.json({
            symbol,
            timeframe,
            prices,
            lastUpdated: new Date()
        });

    } catch (error) {
        console.error('Error fetching stock data:', error);
        
        // Return mock data on error
        res.json({
            symbol: req.params.symbol,
            timeframe: req.query.timeframe || 'daily',
            prices: generateMockStockData(req.params.symbol, req.query.timeframe),
            note: 'Using mock data due to API error'
        });
    }
});

// Get real-time stock quote
router.get('/quote/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        
        const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data['Error Message']) {
            return res.status(400).json({ error: data['Error Message'] });
        }

        if (data['Note']) {
            // API limit reached, return mock quote
            return res.json({
                symbol,
                quote: generateMockQuote(symbol),
                note: 'Using mock data due to API limit'
            });
        }

        const quote = data['Global Quote'];
        if (!quote) {
            return res.status(400).json({ error: 'No quote data available' });
        }

        res.json({
            symbol,
            quote: {
                price: parseFloat(quote['05. price']),
                change: parseFloat(quote['09. change']),
                changePercent: quote['10. change percent'].replace('%', ''),
                volume: parseInt(quote['06. volume']),
                marketCap: quote['07. market cap'],
                high: parseFloat(quote['03. high']),
                low: parseFloat(quote['04. low']),
                open: parseFloat(quote['02. open']),
                previousClose: parseFloat(quote['08. previous close'])
            }
        });

    } catch (error) {
        console.error('Error fetching stock quote:', error);
        
        // Return mock quote on error
        res.json({
            symbol: req.params.symbol,
            quote: generateMockQuote(req.params.symbol),
            note: 'Using mock data due to API error'
        });
    }
});

// Search stocks
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        
        const url = `${ALPHA_VANTAGE_BASE_URL}?function=SYMBOL_SEARCH&keywords=${query}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data['Error Message']) {
            return res.status(400).json({ error: data['Error Message'] });
        }

        if (data['Note']) {
            // API limit reached, return mock search results
            return res.json({
                query,
                results: generateMockSearchResults(query),
                note: 'Using mock data due to API limit'
            });
        }

        const matches = data.bestMatches || [];
        const results = matches.map(match => ({
            symbol: match['1. symbol'],
            name: match['2. name'],
            type: match['3. type'],
            region: match['4. region'],
            marketOpen: match['5. marketOpen'],
            marketClose: match['6. marketClose'],
            timezone: match['7. timezone'],
            currency: match['8. currency']
        }));

        res.json({
            query,
            results
        });

    } catch (error) {
        console.error('Error searching stocks:', error);
        
        // Return mock search results on error
        res.json({
            query: req.params.query,
            results: generateMockSearchResults(req.params.query),
            note: 'Using mock data due to API error'
        });
    }
});

// Helper function to generate mock stock data
function generateMockStockData(symbol, timeframe) {
    const data = [];
    let price = 150 + Math.random() * 100; // Random starting price
    
    for (let i = 0; i < 100; i++) {
        const change = (Math.random() - 0.5) * 10;
        price += change;
        
        const timestamp = new Date();
        if (timeframe === 'daily') {
            timestamp.setDate(timestamp.getDate() - (100 - i));
        } else {
            timestamp.setMinutes(timestamp.getMinutes() - (100 - i) * 5);
        }
        
        data.push({
            timestamp,
            price: Math.max(price, 50),
            volume: Math.floor(Math.random() * 1000000) + 500000,
            open: price + (Math.random() - 0.5) * 5,
            high: price + Math.random() * 5,
            low: price - Math.random() * 5
        });
    }
    
    return data.sort((a, b) => a.timestamp - b.timestamp);
}

// Helper function to generate mock quote
function generateMockQuote(symbol) {
    const basePrice = 100 + Math.random() * 200;
    const change = (Math.random() - 0.5) * 20;
    const changePercent = (change / basePrice) * 100;
    
    return {
        price: basePrice,
        change: change,
        changePercent: changePercent.toFixed(2),
        volume: Math.floor(Math.random() * 10000000) + 1000000,
        marketCap: (Math.random() * 1000000000000 + 10000000000).toFixed(0),
        high: basePrice + Math.random() * 10,
        low: basePrice - Math.random() * 10,
        open: basePrice + (Math.random() - 0.5) * 5,
        previousClose: basePrice - change
    };
}

// Helper function to generate mock search results
function generateMockSearchResults(query) {
    const mockStocks = [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'TSLA', name: 'Tesla Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corporation' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation' },
        { symbol: 'META', name: 'Meta Platforms Inc.' },
        { symbol: 'NFLX', name: 'Netflix Inc.' }
    ];
    
    return mockStocks
        .filter(stock => 
            stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
            stock.name.toLowerCase().includes(query.toLowerCase())
        )
        .map(stock => ({
            symbol: stock.symbol,
            name: stock.name,
            type: 'Equity',
            region: 'United States',
            marketOpen: '09:30',
            marketClose: '16:00',
            timezone: 'UTC-04',
            currency: 'USD'
        }));
}

module.exports = router;