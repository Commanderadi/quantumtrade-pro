const axios = require('axios');

// Multiple API sources for redundancy
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

exports.getStockPrice = async (req, res) => {
    const symbol = req.params.symbol;
    if (!symbol) {
        return res.status(400).json({ message: 'Stock symbol is required.' });
    }

    try {
        // Try Alpha Vantage first
        if (ALPHA_VANTAGE_API_KEY) {
            const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol.toUpperCase()}&apikey=${ALPHA_VANTAGE_API_KEY}`;
            const response = await axios.get(url);
            const data = response.data['Global Quote'];

            if (data && Object.keys(data).length > 0) {
                const priceInfo = {
                    symbol: data['01. symbol'],
                    price: data['05. price'],
                    change: data['09. change'],
                    changePercent: data['10. change percent'],
                    volume: data['06. volume'],
                    previousClose: data['08. previous close'],
                    open: data['02. open'],
                    high: data['03. high'],
                    low: data['04. low'],
                    source: 'Alpha Vantage'
                };
                return res.status(200).json(priceInfo);
            }
        }

        // Fallback to Finnhub if Alpha Vantage fails
        if (FINNHUB_API_KEY) {
            const url = `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${FINNHUB_API_KEY}`;
            const response = await axios.get(url);
            const data = response.data;

            if (data && data.c) {
                const priceInfo = {
                    symbol: symbol.toUpperCase(),
                    price: data.c.toString(),
                    change: (data.c - data.pc).toFixed(2),
                    changePercent: (((data.c - data.pc) / data.pc) * 100).toFixed(2) + '%',
                    volume: data.v,
                    previousClose: data.pc,
                    open: data.o,
                    high: data.h,
                    low: data.l,
                    source: 'Finnhub'
                };
                return res.status(200).json(priceInfo);
            }
        }

        // Mock data for development/testing
        if (!ALPHA_VANTAGE_API_KEY && !FINNHUB_API_KEY) {
            const mockPrice = (Math.random() * 1000 + 50).toFixed(2);
            const mockChange = (Math.random() * 20 - 10).toFixed(2);
            const mockChangePercent = (Math.random() * 10 - 5).toFixed(2);
            
            const priceInfo = {
                symbol: symbol.toUpperCase(),
                price: mockPrice,
                change: mockChange,
                changePercent: mockChangePercent + '%',
                volume: Math.floor(Math.random() * 1000000),
                previousClose: (parseFloat(mockPrice) - parseFloat(mockChange)).toFixed(2),
                open: (parseFloat(mockPrice) + (Math.random() * 10 - 5)).toFixed(2),
                high: (parseFloat(mockPrice) + Math.random() * 5).toFixed(2),
                low: (parseFloat(mockPrice) - Math.random() * 5).toFixed(2),
                source: 'Mock Data (Development)'
            };
            return res.status(200).json(priceInfo);
        }

        return res.status(404).json({ message: 'Could not find data for the given symbol. Please check the symbol or try again later.' });

    } catch (error) {
        console.error('Stock API error:', error.message);
        res.status(500).json({ message: 'Failed to fetch data from the external API.' });
    }
};

exports.getStockInfo = async (req, res) => {
    const symbol = req.params.symbol;
    if (!symbol) {
        return res.status(400).json({ message: 'Stock symbol is required.' });
    }

    try {
        // Get company information
        if (ALPHA_VANTAGE_API_KEY) {
            const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol.toUpperCase()}&apikey=${ALPHA_VANTAGE_API_KEY}`;
            const response = await axios.get(url);
            const data = response.data;

            if (data && data.Symbol) {
                return res.status(200).json({
                    symbol: data.Symbol,
                    name: data.Name,
                    description: data.Description,
                    sector: data.Sector,
                    industry: data.Industry,
                    marketCap: data.MarketCapitalization,
                    peRatio: data.PERatio,
                    dividendYield: data.DividendYield,
                    eps: data.EPS,
                    beta: data.Beta
                });
            }
        }

        return res.status(404).json({ message: 'Company information not found.' });

    } catch (error) {
        console.error('Stock info API error:', error.message);
        res.status(500).json({ message: 'Failed to fetch company information.' });
    }
};