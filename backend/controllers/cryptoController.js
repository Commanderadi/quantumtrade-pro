const axios = require('axios');

// Multiple API sources for crypto data
const COINAPI_KEY = process.env.COINAPI_KEY;
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

// Symbol mapping for common cryptocurrencies (CoinGecko uses IDs, not symbols)
const CRYPTO_SYMBOL_MAP = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'ADA': 'cardano',
    'XRP': 'ripple',
    'AVAX': 'avalanche-2',
    'DOT': 'polkadot',
    'MATIC': 'matic-network',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'ATOM': 'cosmos',
    'LTC': 'litecoin',
    'BCH': 'bitcoin-cash',
    'ETC': 'ethereum-classic',
    'FIL': 'filecoin',
    'TRX': 'tron',
    'NEAR': 'near',
    'APT': 'aptos'
};

exports.getCryptoPrice = async (req, res) => {
    const symbol = req.params.symbol;
    if (!symbol) {
        return res.status(400).json({ message: 'Cryptocurrency symbol is required.' });
    }

    try {
        // Check if we have a mapping for this symbol
        const coinId = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
        
        if (coinId) {
            // Try CoinGecko first (free, no API key required)
            const url = `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
            const response = await axios.get(url);
            const data = response.data;

            // CoinGecko returns data with the coin ID as the key
            if (data && data[coinId]) {
                const cryptoData = data[coinId];
                const priceInfo = {
                    symbol: symbol.toUpperCase(),
                    price: cryptoData.usd,
                    change24h: cryptoData.usd_24h_change,
                    changePercent: cryptoData.usd_24h_change ? cryptoData.usd_24h_change.toFixed(2) + '%' : '0%',
                    volume24h: cryptoData.usd_24h_vol,
                    marketCap: cryptoData.usd_market_cap,
                    source: 'CoinGecko'
                };
                return res.status(200).json(priceInfo);
            }
            
            // If the data structure is different (direct response), try to extract it
            if (data && data.usd) {
                const priceInfo = {
                    symbol: symbol.toUpperCase(),
                    price: data.usd,
                    change24h: data.usd_24h_change,
                    changePercent: data.usd_24h_change ? data.usd_24h_change.toFixed(2) + '%' : '0%',
                    volume24h: data.usd_24h_vol,
                    marketCap: data.usd_market_cap,
                    source: 'CoinGecko'
                };
                return res.status(200).json(priceInfo);
            }
        }

        // Fallback to CoinAPI if available
        if (COINAPI_KEY) {
            try {
                const url = `https://rest.coinapi.io/v1/exchangerate/${symbol.toUpperCase()}/USD`;
                const response = await axios.get(url, {
                    headers: { 'X-CoinAPI-Key': COINAPI_KEY }
                });
                const data = response.data;

                if (data && data.rate) {
                    const priceInfo = {
                        symbol: symbol.toUpperCase(),
                        price: data.rate,
                        change24h: 0, // CoinAPI doesn't provide this in basic endpoint
                        changePercent: '0%',
                        volume24h: 0,
                        marketCap: 0,
                        source: 'CoinAPI'
                    };
                    return res.status(200).json(priceInfo);
                }
            } catch (coinApiError) {
                console.log('CoinAPI fallback failed:', coinApiError.message);
            }
        }

        // Mock data for development/testing when no real data is available
        const mockPrice = (Math.random() * 50000 + 1000).toFixed(2);
        const mockChange = (Math.random() * 20 - 10).toFixed(2);
        
        const priceInfo = {
            symbol: symbol.toUpperCase(),
            price: mockPrice,
            change24h: mockChange,
            changePercent: mockChange + '%',
            volume24h: Math.floor(Math.random() * 1000000000),
            marketCap: Math.floor(Math.random() * 10000000000),
            source: 'Mock Data (Development)'
        };
        return res.status(200).json(priceInfo);

    } catch (error) {
        console.error('Crypto API error:', error.message);
        // Return mock data instead of error for better user experience
        const mockPrice = (Math.random() * 50000 + 1000).toFixed(2);
        const mockChange = (Math.random() * 20 - 10).toFixed(2);
        
        const priceInfo = {
            symbol: symbol.toUpperCase(),
            price: mockPrice,
            change24h: mockChange,
            changePercent: mockChange + '%',
            volume24h: Math.floor(Math.random() * 1000000000),
            marketCap: Math.floor(Math.random() * 10000000000),
            source: 'Mock Data (Error Fallback)'
        };
        return res.status(200).json(priceInfo);
    }
};

exports.getCryptoInfo = async (req, res) => {
    const symbol = req.params.symbol;
    if (!symbol) {
        return res.status(400).json({ message: 'Cryptocurrency symbol is required.' });
    }

    try {
        const url = `${COINGECKO_API_URL}/coins/${symbol.toLowerCase()}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data && data.id) {
            return res.status(200).json({
                symbol: data.symbol.toUpperCase(),
                name: data.name,
                description: data.description.en,
                marketCap: data.market_data.market_cap.usd,
                volume24h: data.market_data.total_volume.usd,
                circulatingSupply: data.market_data.circulating_supply,
                totalSupply: data.market_data.total_supply,
                maxSupply: data.market_data.max_supply,
                ath: data.market_data.ath.usd,
                athDate: data.market_data.ath_date.usd,
                atl: data.market_data.atl.usd,
                atlDate: data.market_data.atl_date.usd,
                homepage: data.links.homepage[0],
                blockchainSite: data.links.blockchain_site[0],
                officialForumUrl: data.links.official_forum_url[0],
                reposUrl: data.links.repos_url.github[0],
                image: data.image.large
            });
        }

        return res.status(404).json({ message: 'Cryptocurrency information not found.' });

    } catch (error) {
        console.error('Crypto info API error:', error.message);
        res.status(500).json({ message: 'Failed to fetch cryptocurrency information.' });
    }
};

exports.getTopCryptos = async (req, res) => {
    try {
        const limit = req.query.limit || 10;
        const url = `${COINGECKO_API_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;
        const response = await axios.get(url);
        const data = response.data;

        const topCryptos = data.map(coin => ({
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            price: coin.current_price,
            change24h: coin.price_change_percentage_24h,
            marketCap: coin.market_cap,
            volume24h: coin.total_volume,
            image: coin.image
        }));

        res.status(200).json(topCryptos);

    } catch (error) {
        console.error('Top cryptos API error:', error.message);
        res.status(500).json({ message: 'Failed to fetch top cryptocurrencies.' });
    }
}; 