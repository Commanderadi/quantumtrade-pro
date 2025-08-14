import React, { useState, useEffect } from 'react';
import { 
    PieChart, 
    Pie, 
    Cell, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';
import { FaChartPie, FaChartBar, FaChartLine, FaDollarSign } from 'react-icons/fa';
import './PortfolioAnalytics.css';

const PortfolioAnalytics = ({ portfolio, transactions }) => {
    const [allocationData, setAllocationData] = useState([]);
    const [performanceData, setPerformanceData] = useState([]);
    const [riskMetrics, setRiskMetrics] = useState({});

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

    useEffect(() => {
        if (portfolio && portfolio.length > 0) {
            generateAllocationData();
            generatePerformanceData();
            calculateRiskMetrics();
        }
    }, [portfolio, transactions]);

    const generateAllocationData = () => {
        const allocation = portfolio.map(holding => ({
            name: holding.symbol,
            value: parseFloat(holding.quantity) * parseFloat(holding.average_price),
            type: holding.type
        }));

        // Group by type (stock/crypto)
        const stockAllocation = allocation.filter(item => item.type === 'stock');
        const cryptoAllocation = allocation.filter(item => item.type === 'crypto');

        const data = [
            ...stockAllocation.map(item => ({ ...item, name: `${item.name} (Stock)` })),
            ...cryptoAllocation.map(item => ({ ...item, name: `${item.name} (Crypto)` }))
        ];

        setAllocationData(data);
    };

    const generatePerformanceData = () => {
        // Generate mock performance data over the last 30 days
        const data = [];
        const baseValue = 10000; // Starting portfolio value
        let currentValue = baseValue;

        for (let i = 30; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            // Simulate daily returns with some volatility
            const dailyReturn = (Math.random() - 0.5) * 0.04; // ±2% daily volatility
            currentValue *= (1 + dailyReturn);

            data.push({
                date: date.toLocaleDateString(),
                value: parseFloat(currentValue.toFixed(2)),
                return: parseFloat((dailyReturn * 100).toFixed(2))
            });
        }

        setPerformanceData(data);
    };

    const calculateRiskMetrics = () => {
        if (performanceData.length === 0) return;

        const returns = performanceData.map(d => d.return);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        
        // Calculate volatility (standard deviation)
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);

        // Calculate max drawdown
        let maxDrawdown = 0;
        let peak = performanceData[0].value;
        
        performanceData.forEach(data => {
            if (data.value > peak) {
                peak = data.value;
            }
            const drawdown = (peak - data.value) / peak * 100;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });

        setRiskMetrics({
            totalReturn: ((performanceData[performanceData.length - 1].value - 10000) / 10000 * 100).toFixed(2),
            avgDailyReturn: avgReturn.toFixed(2),
            volatility: volatility.toFixed(2),
            maxDrawdown: maxDrawdown.toFixed(2),
            sharpeRatio: (avgReturn / volatility).toFixed(2)
        });
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip">
                    <p className="label">{`${label}`}</p>
                    {payload.map((entry, index) => (
                        <p key={index} style={{ color: entry.color }}>
                            {`${entry.name}: $${entry.value.toLocaleString()}`}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    const PerformanceTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip">
                    <p className="label">{`Date: ${label}`}</p>
                    <p className="value">{`Portfolio Value: $${payload[0].value.toLocaleString()}`}</p>
                    <p className="return">{`Daily Return: ${payload[0].payload.return}%`}</p>
                </div>
            );
        }
        return null;
    };

    if (!portfolio || portfolio.length === 0) {
        return (
            <div className="portfolio-analytics">
                <div className="analytics-placeholder">
                    <FaChartPie />
                    <p>No portfolio data available</p>
                    <span>Add some holdings to see analytics</span>
                </div>
            </div>
        );
    }

    return (
        <div className="portfolio-analytics">
            <h2><FaChartPie /> Portfolio Analytics</h2>
            
            <div className="analytics-grid">
                {/* Asset Allocation */}
                <div className="analytics-card">
                    <h3><FaChartPie /> Asset Allocation</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={allocationData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {allocationData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Performance Chart */}
                <div className="analytics-card">
                    <h3><FaChartLine /> Portfolio Performance</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={performanceData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="date" 
                                tick={{ fontSize: 10 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis 
                                tick={{ fontSize: 10 }}
                                tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`}
                            />
                            <Tooltip content={<PerformanceTooltip />} />
                            <Line 
                                type="monotone" 
                                dataKey="value" 
                                stroke="#8884d8" 
                                strokeWidth={2}
                                dot={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Risk Metrics */}
                <div className="analytics-card">
                    <h3><FaChartBar /> Risk Metrics</h3>
                    <div className="risk-metrics">
                        <div className="metric">
                            <div className="metric-label">Total Return</div>
                            <div className={`metric-value ${parseFloat(riskMetrics.totalReturn) >= 0 ? 'positive' : 'negative'}`}>
                                {riskMetrics.totalReturn}%
                            </div>
                        </div>
                        <div className="metric">
                            <div className="metric-label">Avg Daily Return</div>
                            <div className={`metric-value ${parseFloat(riskMetrics.avgDailyReturn) >= 0 ? 'positive' : 'negative'}`}>
                                {riskMetrics.avgDailyReturn}%
                            </div>
                        </div>
                        <div className="metric">
                            <div className="metric-label">Volatility</div>
                            <div className="metric-value">
                                {riskMetrics.volatility}%
                            </div>
                        </div>
                        <div className="metric">
                            <div className="metric-label">Max Drawdown</div>
                            <div className="metric-value negative">
                                -{riskMetrics.maxDrawdown}%
                            </div>
                        </div>
                        <div className="metric">
                            <div className="metric-label">Sharpe Ratio</div>
                            <div className="metric-value">
                                {riskMetrics.sharpeRatio}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Holdings Breakdown */}
                <div className="analytics-card">
                    <h3><FaDollarSign /> Holdings Breakdown</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={allocationData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="name" 
                                tick={{ fontSize: 10 }}
                                angle={-45}
                                textAnchor="end"
                                height={80}
                            />
                            <YAxis 
                                tick={{ fontSize: 10 }}
                                tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default PortfolioAnalytics; 