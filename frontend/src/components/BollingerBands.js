import React, { useState, useMemo } from 'react';
import './BollingerBands.css';

const BollingerBands = () => {
    const [period, setPeriod] = useState(20);
    const [deviation, setDeviation] = useState(2);
    const [smoothing, setSmoothing] = useState(20);

    // Generate realistic price data with volatility clustering
    const generatePriceData = useMemo(() => {
        const data = [];
        let price = 100;
        let volatility = 0.02;
        
        for (let i = 0; i < 100; i++) {
            // Volatility clustering (GARCH-like behavior)
            if (Math.random() > 0.7) {
                volatility = Math.min(0.05, volatility * 1.2);
            } else {
                volatility = Math.max(0.01, volatility * 0.95);
            }
            
            const change = (Math.random() - 0.5) * volatility * price;
            price += change;
            data.push(price);
        }
        return data;
    }, []);

    // Calculate Bollinger Bands
    const bollingerData = useMemo(() => {
        if (generatePriceData.length < period) return [];

        const bands = [];
        for (let i = period - 1; i < generatePriceData.length; i++) {
            const slice = generatePriceData.slice(i - period + 1, i + 1);
            const sma = slice.reduce((sum, price) => sum + price, 0) / period;
            
            const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
            const standardDeviation = Math.sqrt(variance);
            
            const upperBand = sma + (deviation * standardDeviation);
            const lowerBand = sma - (deviation * standardDeviation);
            
            bands.push({
                price: generatePriceData[i],
                sma,
                upperBand,
                lowerBand,
                standardDeviation,
                bandwidth: (upperBand - lowerBand) / sma,
                percentB: (generatePriceData[i] - lowerBand) / (upperBand - lowerBand)
            });
        }
        return bands;
    }, [generatePriceData, period, deviation]);

    // Generate trading signals
    const signals = useMemo(() => {
        const signals = [];
        for (let i = 1; i < bollingerData.length; i++) {
            const current = bollingerData[i];
            const previous = bollingerData[i - 1];
            
            // Price touching upper band (potential reversal)
            if (current.price >= current.upperBand * 0.99 && previous.price < previous.upperBand * 0.99) {
                signals.push({ index: i, type: 'sell', reason: 'Upper Band Touch', strength: 'High' });
            }
            // Price touching lower band (potential reversal)
            else if (current.price <= current.lowerBand * 1.01 && previous.price > previous.lowerBand * 1.01) {
                signals.push({ index: i, type: 'buy', reason: 'Lower Band Touch', strength: 'High' });
            }
            // Squeeze (low volatility) - potential breakout
            else if (current.bandwidth < 0.05 && previous.bandwidth >= 0.05) {
                signals.push({ index: i, type: 'watch', reason: 'Squeeze Detected', strength: 'Medium' });
            }
            // Expansion (high volatility) - trend continuation
            else if (current.bandwidth > 0.15 && previous.bandwidth <= 0.15) {
                signals.push({ index: i, type: 'trend', reason: 'Volatility Expansion', strength: 'Medium' });
            }
        }
        return signals;
    }, [bollingerData]);

    return (
        <div className="bollinger-bands">
            <div className="indicator-header">
                <h2>Bollinger Bands - Professional Volatility Analysis</h2>
                <p>Advanced volatility indicator with squeeze detection, bandwidth analysis, and %B positioning</p>
            </div>

            <div className="controls">
                <div className="control-group">
                    <label>Period (SMA):</label>
                    <input
                        type="range"
                        min="10"
                        max="50"
                        value={period}
                        onChange={(e) => setPeriod(Number(e.target.value))}
                    />
                    <span>{period}</span>
                </div>
                <div className="control-group">
                    <label>Standard Deviation:</label>
                    <input
                        type="range"
                        min="1.5"
                        max="3"
                        step="0.1"
                        value={deviation}
                        onChange={(e) => setDeviation(Number(e.target.value))}
                    />
                    <span>{deviation}</span>
                </div>
            </div>

            <div className="chart-container">
                <svg width="800" height="500" className="bb-chart">
                    {/* Grid */}
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                        </pattern>
                    </defs>
                    <rect width="800" height="500" fill="url(#grid)" />

                    {/* Price Scale */}
                    <text x="20" y="30" fill="#ffffff" fontSize="12">{(Math.max(...generatePriceData) * 1.1).toFixed(0)}</text>
                    <text x="20" y="250" fill="#ffffff" fontSize="12">{(Math.min(...generatePriceData) * 0.9).toFixed(0)}</text>

                    {/* Bollinger Bands */}
                    {bollingerData.map((band, i) => {
                        const x = 50 + i * 7;
                        const priceY = 500 - ((band.price - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;
                        const upperY = 500 - ((band.upperBand - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;
                        const lowerY = 500 - ((band.lowerBand - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;
                        const smaY = 500 - ((band.sma - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;

                        return (
                            <g key={i}>
                                {/* Upper Band */}
                                <circle cx={x} cy={upperY} r="2" fill="#ef4444" opacity="0.8" />
                                {/* Lower Band */}
                                <circle cx={x} cy={lowerY} r="2" fill="#22c55e" opacity="0.8" />
                                {/* SMA */}
                                <circle cx={x} cy={smaY} r="2" fill="#f59e0b" opacity="0.8" />
                                {/* Price */}
                                <circle cx={x} cy={priceY} r="3" fill="#3b82f6" />
                            </g>
                        );
                    })}

                    {/* Connect the dots for bands */}
                    <polyline
                        points={bollingerData.map((band, i) => {
                            const x = 50 + i * 7;
                            const upperY = 500 - ((band.upperBand - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;
                            return `${x},${upperY}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="1"
                        opacity="0.6"
                    />
                    <polyline
                        points={bollingerData.map((band, i) => {
                            const x = 50 + i * 7;
                            const lowerY = 500 - ((band.lowerBand - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;
                            return `${x},${lowerY}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="1"
                        opacity="0.6"
                    />
                    <polyline
                        points={bollingerData.map((band, i) => {
                            const x = 50 + i * 7;
                            const smaY = 500 - ((band.sma - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;
                            return `${x},${smaY}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                    />

                    {/* Trading Signals */}
                    {signals.map((signal, index) => {
                        const x = 50 + signal.index * 7;
                        const y = 500 - ((bollingerData[signal.index].price - Math.min(...generatePriceData) * 0.9) / (Math.max(...generatePriceData) * 1.1 - Math.min(...generatePriceData) * 0.9)) * 400;
                        const color = signal.type === 'buy' ? '#22c55e' : signal.type === 'sell' ? '#ef4444' : '#f59e0b';
                        
                        return (
                            <circle
                                key={index}
                                cx={x}
                                cy={y}
                                r="8"
                                fill={color}
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                        );
                    })}
                </svg>
            </div>

            <div className="analysis">
                <h3>Bollinger Bands Analysis</h3>
                
                <div className="current-values">
                    <div className="value-item">
                        <strong>Current Price:</strong> ${bollingerData[bollingerData.length - 1]?.price.toFixed(2) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>Upper Band:</strong> ${bollingerData[bollingerData.length - 1]?.upperBand.toFixed(2) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>Lower Band:</strong> ${bollingerData[bollingerData.length - 1]?.lowerBand.toFixed(2) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>20 SMA:</strong> ${bollingerData[bollingerData.length - 1]?.sma.toFixed(2) || 'N/A'}
                    </div>
                </div>

                <div className="advanced-metrics">
                    <div className="metric-item">
                        <strong>Bandwidth:</strong> {(bollingerData[bollingerData.length - 1]?.bandwidth * 100).toFixed(2) || 'N/A'}%
                        <span className="metric-label">Volatility Measure</span>
                    </div>
                    <div className="metric-item">
                        <strong>%B Position:</strong> {(bollingerData[bollingerData.length - 1]?.percentB * 100).toFixed(1) || 'N/A'}%
                        <span className="metric-label">Price Position in Bands</span>
                    </div>
                    <div className="metric-item">
                        <strong>Standard Deviation:</strong> {bollingerData[bollingerData.length - 1]?.standardDeviation.toFixed(2) || 'N/A'}
                        <span className="metric-label">Current Volatility</span>
                    </div>
                </div>

                <div className="signals-summary">
                    <strong>Recent Signals:</strong>
                    <ul>
                        {signals.slice(-5).map((signal, index) => (
                            <li key={index} className={signal.type}>
                                <span className="signal-type">{signal.type.toUpperCase()}</span>
                                <span className="signal-reason">{signal.reason}</span>
                                <span className="signal-strength">Strength: {signal.strength}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="interpretation">
                    <h4>Professional Interpretation:</h4>
                    <ul>
                        <li><strong>Squeeze (Bandwidth &lt; 5%):</strong> Low volatility, potential breakout ahead</li>
                        <li><strong>Expansion (Bandwidth &gt; 15%):</strong> High volatility, trend continuation likely</li>
                        <li><strong>%B &gt; 100%:</strong> Price above upper band, potential reversal</li>
                        <li><strong>%B &lt; 0%:</strong> Price below lower band, potential reversal</li>
                        <li><strong>Mean Reversion:</strong> Price tends to return to the middle band (SMA)</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default BollingerBands; 