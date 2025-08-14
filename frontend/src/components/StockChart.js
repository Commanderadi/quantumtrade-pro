import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts';
import { FaChartLine, FaCalendarAlt } from 'react-icons/fa';
import './StockChart.css';

const StockChart = ({ symbol, type = 'stock' }) => {
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [timeframe, setTimeframe] = useState('1D');

    const timeframes = [
        { label: '1D', value: '1D' },
        { label: '1W', value: '1W' },
        { label: '1M', value: '1M' },
        { label: '3M', value: '3M' },
        { label: '1Y', value: '1Y' }
    ];

    useEffect(() => {
        if (symbol) {
            fetchChartData();
        }
    }, [symbol, timeframe]);

    const fetchChartData = async () => {
        if (!symbol) return;
        
        setLoading(true);
        setError('');
        
        try {
            let data;
            
            if (type === 'stock') {
                // For stocks, we'll use mock data for now since we need historical data
                data = generateMockStockData(timeframe);
            } else {
                // For crypto, we'll use mock data as well
                data = generateMockCryptoData(timeframe);
            }
            
            setChartData(data);
        } catch (err) {
            setError('Failed to fetch chart data');
            console.error('Chart data error:', err);
        } finally {
            setLoading(false);
        }
    };

    const generateMockStockData = (period) => {
        const data = [];
        const basePrice = 150 + Math.random() * 100;
        const points = period === '1D' ? 24 : period === '1W' ? 7 : period === '1M' ? 30 : period === '3M' ? 90 : 365;
        
        for (let i = 0; i < points; i++) {
            const volatility = 0.02;
            const change = (Math.random() - 0.5) * volatility;
            const price = basePrice * (1 + change);
            
            data.push({
                time: period === '1D' ? `${i}:00` : `Day ${i + 1}`,
                price: parseFloat(price.toFixed(2)),
                volume: Math.floor(Math.random() * 1000000) + 100000
            });
        }
        
        return data;
    };

    const generateMockCryptoData = (period) => {
        const data = [];
        const basePrice = 50000 + Math.random() * 20000;
        const points = period === '1D' ? 24 : period === '1W' ? 7 : period === '1M' ? 30 : period === '3M' ? 90 : 365;
        
        for (let i = 0; i < points; i++) {
            const volatility = 0.05; // Higher volatility for crypto
            const change = (Math.random() - 0.5) * volatility;
            const price = basePrice * (1 + change);
            
            data.push({
                time: period === '1D' ? `${i}:00` : `Day ${i + 1}`,
                price: parseFloat(price.toFixed(2)),
                volume: Math.floor(Math.random() * 1000000000) + 100000000
            });
        }
        
        return data;
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip">
                    <p className="label">{`Time: ${label}`}</p>
                    <p className="price">{`Price: $${payload[0].value.toLocaleString()}`}</p>
                    {payload[1] && <p className="volume">{`Volume: ${payload[1].value.toLocaleString()}`}</p>}
                </div>
            );
        }
        return null;
    };

    if (!symbol) {
        return (
            <div className="stock-chart-container">
                <div className="chart-placeholder">
                    <FaChartLine />
                    <p>Enter a symbol to view chart</p>
                </div>
            </div>
        );
    }

    return (
        <div className="stock-chart-container">
            <div className="chart-header">
                <h3>
                    <FaChartLine /> {symbol} Price Chart
                </h3>
                <div className="timeframe-selector">
                    <FaCalendarAlt />
                    {timeframes.map(tf => (
                        <button
                            key={tf.value}
                            className={timeframe === tf.value ? 'active' : ''}
                            onClick={() => setTimeframe(tf.value)}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div className="chart-loading">
                    <div className="spinner"></div>
                    <p>Loading chart data...</p>
                </div>
            )}

            {error && (
                <div className="chart-error">
                    <p>{error}</p>
                </div>
            )}

            {!loading && !error && chartData.length > 0 && (
                <div className="chart-content">
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="time" 
                                tick={{ fontSize: 12 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis 
                                domain={['dataMin - 10', 'dataMax + 10']}
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => `$${value.toLocaleString()}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke="#8884d8"
                                fillOpacity={1}
                                fill="url(#colorPrice)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

export default StockChart; 