import React, { useState, useMemo } from 'react';
import './MACDIndicator.css';

const MACDIndicator = () => {
    const [fastPeriod, setFastPeriod] = useState(12);
    const [slowPeriod, setSlowPeriod] = useState(26);
    const [signalPeriod, setSignalPeriod] = useState(9);

    // Mock price data
    const priceData = useMemo(() => {
        return Array.from({ length: 100 }, (_, i) => {
            const basePrice = 100;
            const trend = Math.sin(i * 0.05) * 30;
            const noise = (Math.random() - 0.5) * 15;
            return basePrice + trend + noise;
        });
    }, []);

    // Calculate EMA
    const calculateEMA = (data, period) => {
        const k = 2 / (period + 1);
        let ema = data[0];
        const emaValues = [ema];
        
        for (let i = 1; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
            emaValues.push(ema);
        }
        
        return emaValues;
    };

    // Calculate MACD
    const macdData = useMemo(() => {
        const fastEMA = calculateEMA(priceData, fastPeriod);
        const slowEMA = calculateEMA(priceData, slowPeriod);
        
        const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
        const signalLine = calculateEMA(macdLine, signalPeriod);
        const histogram = macdLine.map((macd, i) => macd - signalLine[i]);
        
        return { macdLine, signalLine, histogram };
    }, [priceData, fastPeriod, slowPeriod, signalPeriod]);

    // Generate trading signals
    const signals = useMemo(() => {
        const signals = [];
        for (let i = 1; i < macdData.histogram.length; i++) {
            if (macdData.histogram[i] > 0 && macdData.histogram[i-1] <= 0) {
                signals.push({ index: i, type: 'buy', value: macdData.histogram[i] });
            } else if (macdData.histogram[i] < 0 && macdData.histogram[i-1] >= 0) {
                signals.push({ index: i, type: 'sell', value: macdData.histogram[i] });
            }
        }
        return signals;
    }, [macdData]);

    return (
        <div className="macd-indicator">
            <div className="indicator-header">
                <h2>MACD (Moving Average Convergence Divergence)</h2>
                <p>Trend-following momentum indicator that shows the relationship between two moving averages</p>
            </div>

            <div className="controls">
                <div className="control-group">
                    <label>Fast EMA Period:</label>
                    <input
                        type="range"
                        min="5"
                        max="20"
                        value={fastPeriod}
                        onChange={(e) => setFastPeriod(Number(e.target.value))}
                    />
                    <span>{fastPeriod}</span>
                </div>
                <div className="control-group">
                    <label>Slow EMA Period:</label>
                    <input
                        type="range"
                        min="20"
                        max="50"
                        value={slowPeriod}
                        onChange={(e) => setSlowPeriod(Number(e.target.value))}
                    />
                    <span>{slowPeriod}</span>
                </div>
                <div className="control-group">
                    <label>Signal Period:</label>
                    <input
                        type="range"
                        min="5"
                        max="20"
                        value={signalPeriod}
                        onChange={(e) => setSignalPeriod(Number(e.target.value))}
                    />
                    <span>{signalPeriod}</span>
                </div>
            </div>

            <div className="chart-container">
                <svg width="800" height="500" className="macd-chart">
                    {/* Grid */}
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                        </pattern>
                    </defs>
                    <rect width="800" height="500" fill="url(#grid)" />

                    {/* MACD Line */}
                    <polyline
                        points={macdData.macdLine.map((value, i) => 
                            `${50 + i * 7},${250 - (value * 3)}`
                        ).join(' ')}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                    />

                    {/* Signal Line */}
                    <polyline
                        points={macdData.signalLine.map((value, i) => 
                            `${50 + i * 7},${250 - (value * 3)}`
                        ).join(' ')}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                    />

                    {/* Histogram */}
                    {macdData.histogram.map((value, i) => (
                        <rect
                            key={i}
                            x={50 + i * 7 - 2}
                            y={250 - (value > 0 ? value * 3 : 0)}
                            width="4"
                            height={Math.abs(value * 3)}
                            fill={value > 0 ? '#22c55e' : '#ef4444'}
                            opacity="0.8"
                        />
                    ))}

                    {/* Zero line */}
                    <line x1="50" y1="250" x2="750" y2="250" stroke="#ffffff" strokeWidth="1" strokeDasharray="5,5" />

                    {/* Trading Signals */}
                    {signals.map((signal, index) => (
                        <circle
                            key={index}
                            cx={50 + signal.index * 7}
                            cy={250 - (signal.value * 3)}
                            r="6"
                            fill={signal.type === 'buy' ? '#22c55e' : '#ef4444'}
                            stroke="#ffffff"
                            strokeWidth="2"
                        />
                    ))}
                </svg>
            </div>

            <div className="analysis">
                <h3>MACD Analysis</h3>
                <div className="current-values">
                    <div className="value-item">
                        <strong>MACD Line:</strong> {macdData.macdLine[macdData.macdLine.length - 1]?.toFixed(4) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>Signal Line:</strong> {macdData.signalLine[macdData.signalLine.length - 1]?.toFixed(4) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>Histogram:</strong> {macdData.histogram[macdData.histogram.length - 1]?.toFixed(4) || 'N/A'}
                    </div>
                </div>
                
                <div className="signals-summary">
                    <strong>Recent Signals:</strong>
                    <ul>
                        {signals.slice(-5).map((signal, index) => (
                            <li key={index} className={signal.type}>
                                {signal.type.toUpperCase()}: Histogram = {signal.value.toFixed(4)}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="interpretation">
                    <h4>Interpretation:</h4>
                    <ul>
                        <li><strong>Bullish Crossover:</strong> MACD line crosses above signal line (buy signal)</li>
                        <li><strong>Bearish Crossover:</strong> MACD line crosses below signal line (sell signal)</li>
                        <li><strong>Histogram:</strong> Shows the difference between MACD and signal line</li>
                        <li><strong>Divergence:</strong> Price and MACD moving in opposite directions</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default MACDIndicator; 