import React, { useState, useMemo } from 'react';
import './ATRIndicator.css';

const ATRIndicator = () => {
    const [period, setPeriod] = useState(14);
    const [multiplier, setMultiplier] = useState(2);

    // Generate realistic OHLC data
    const generateOHLCData = useMemo(() => {
        const data = [];
        let price = 100;
        
        for (let i = 0; i < 100; i++) {
            const volatility = 0.02 + Math.sin(i * 0.1) * 0.01; // Varying volatility
            const change = (Math.random() - 0.5) * volatility * price;
            
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
            const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
            
            data.push({
                open: Math.max(open, 50),
                high: Math.max(high, open, close),
                low: Math.min(low, open, close),
                close: Math.max(close, 50),
                timestamp: i
            });
            
            price = close;
        }
        return data;
    }, []);

    // Calculate True Range
    const calculateTrueRange = (current, previous) => {
        if (!previous) return current.high - current.low;
        
        const tr1 = current.high - current.low;
        const tr2 = Math.abs(current.high - previous.close);
        const tr3 = Math.abs(current.low - previous.close);
        
        return Math.max(tr1, tr2, tr3);
    };

    // Calculate ATR
    const atrData = useMemo(() => {
        if (generateOHLCData.length < period) return [];

        const trValues = generateOHLCData.map((candle, i) => 
            calculateTrueRange(candle, generateOHLCData[i - 1])
        );

        const atrValues = [];
        let atr = trValues.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
        atrValues.push(atr);

        for (let i = period; i < trValues.length; i++) {
            atr = (atr * (period - 1) + trValues[i]) / period;
            atrValues.push(atr);
        }

        return atrValues;
    }, [generateOHLCData, period]);

    // Calculate ATR-based levels
    const atrLevels = useMemo(() => {
        if (atrData.length === 0) return [];

        const levels = [];
        for (let i = period - 1; i < generateOHLCData.length; i++) {
            const currentATR = atrData[i - (period - 1)];
            const currentPrice = generateOHLCData[i].close;
            
            levels.push({
                upper: currentPrice + (multiplier * currentATR),
                lower: currentPrice - (multiplier * currentATR),
                middle: currentPrice,
                atr: currentATR,
                timestamp: i
            });
        }
        return levels;
    }, [atrData, generateOHLCData, period, multiplier]);

    // Generate trading signals
    const signals = useMemo(() => {
        const signals = [];
        if (atrLevels.length < 2) return signals;

        for (let i = 1; i < atrLevels.length; i++) {
            const current = atrLevels[i];
            const previous = atrLevels[i - 1];
            const currentPrice = generateOHLCData[current.timestamp].close;
            
            // Breakout above upper band
            if (currentPrice > current.upper && generateOHLCData[previous.timestamp].close <= previous.upper) {
                signals.push({
                    type: 'breakout_up',
                    reason: 'Price broke above ATR upper band',
                    strength: 'High',
                    description: `Bullish breakout with ${(current.atr / currentPrice * 100).toFixed(2)}% volatility`
                });
            }
            
            // Breakout below lower band
            else if (currentPrice < current.lower && generateOHLCData[previous.timestamp].close >= previous.lower) {
                signals.push({
                    type: 'breakout_down',
                    reason: 'Price broke below ATR lower band',
                    strength: 'High',
                    description: `Bearish breakout with ${(current.atr / currentPrice * 100).toFixed(2)}% volatility`
                });
            }
            
            // Volatility expansion
            const volatilityChange = (current.atr - previous.atr) / previous.atr;
            if (volatilityChange > 0.2) {
                signals.push({
                    type: 'volatility_expansion',
                    reason: 'Volatility expanded significantly',
                    strength: 'Medium',
                    description: `ATR increased by ${(volatilityChange * 100).toFixed(1)}% - potential trend continuation`
                });
            }
            
            // Volatility contraction
            else if (volatilityChange < -0.2) {
                signals.push({
                    type: 'volatility_contraction',
                    reason: 'Volatility contracted significantly',
                    strength: 'Medium',
                    description: `ATR decreased by ${(Math.abs(volatilityChange) * 100).toFixed(1)}% - potential reversal`
                });
            }
        }
        return signals;
    }, [atrLevels, generateOHLCData]);

    // Calculate position sizing recommendations
    const positionSizing = useMemo(() => {
        if (atrLevels.length === 0) return null;
        
        const currentATR = atrLevels[atrLevels.length - 1].atr;
        const currentPrice = atrLevels[atrLevels.length - 1].middle;
        const volatility = (currentATR / currentPrice) * 100;
        
        // Risk-based position sizing (assuming 2% risk per trade)
        const riskPerTrade = 0.02;
        const stopLossDistance = currentATR * multiplier;
        const positionSize = riskPerTrade / (stopLossDistance / currentPrice);
        
        return {
            volatility: volatility.toFixed(2),
            stopLossDistance: stopLossDistance.toFixed(2),
            recommendedPositionSize: (positionSize * 100).toFixed(1),
            riskRewardRatio: (stopLossDistance / currentATR).toFixed(2)
        };
    }, [atrLevels, multiplier]);

    return (
        <div className="atr-indicator">
            <div className="indicator-header">
                <h2>ATR (Average True Range) - Volatility Analysis</h2>
                <p>Professional volatility indicator for position sizing and risk management</p>
            </div>

            <div className="controls">
                <div className="control-group">
                    <label>ATR Period:</label>
                    <input
                        type="range"
                        min="5"
                        max="30"
                        value={period}
                        onChange={(e) => setPeriod(Number(e.target.value))}
                    />
                    <span>{period}</span>
                </div>
                <div className="control-group">
                    <label>Multiplier:</label>
                    <input
                        type="range"
                        min="1"
                        max="4"
                        step="0.1"
                        value={multiplier}
                        onChange={(e) => setMultiplier(Number(e.target.value))}
                    />
                    <span>{multiplier}</span>
                </div>
            </div>

            <div className="chart-container">
                <svg width="800" height="500" className="atr-chart">
                    {/* Grid */}
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                        </pattern>
                    </defs>
                    <rect width="800" height="500" fill="url(#grid)" />

                    {/* Price Scale */}
                    <text x="20" y="30" fill="#ffffff" fontSize="12">{(Math.max(...generateOHLCData.map(d => d.high)) * 1.1).toFixed(0)}</text>
                    <text x="20" y="250" fill="#ffffff" fontSize="12">{(Math.min(...generateOHLCData.map(d => d.low)) * 0.9).toFixed(0)}</text>

                    {/* ATR Bands */}
                    {atrLevels.map((level, i) => {
                        const x = 50 + i * 7;
                        const upperY = 500 - ((level.upper - Math.min(...generateOHLCData.map(d => d.low)) * 0.9) / (Math.max(...generateOHLCData.map(d => d.high)) * 1.1 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9)) * 400;
                        const lowerY = 500 - ((level.lower - Math.min(...generateOHLCData.map(d => d.low)) * 0.9) / (Math.max(...generateOHLCData.map(d => d.high)) * 1.1 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9)) * 400;
                        const middleY = 500 - ((level.middle - Math.min(...generateOHLCData.map(d => d.low)) * 0.9) / (Math.max(...generateOHLCData.map(d => d.high)) * 1.1 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9)) * 400;

                        return (
                            <g key={i}>
                                {/* Upper Band */}
                                <circle cx={x} cy={upperY} r="2" fill="#ef4444" opacity="0.8" />
                                {/* Lower Band */}
                                <circle cx={x} cy={lowerY} r="2" fill="#22c55e" opacity="0.8" />
                                {/* Middle Line */}
                                <circle cx={x} cy={middleY} r="2" fill="#f59e0b" opacity="0.8" />
                            </g>
                        );
                    })}

                    {/* Connect the dots for bands */}
                    <polyline
                        points={atrLevels.map((level, i) => {
                            const x = 50 + i * 7;
                            const upperY = 500 - ((level.upper - Math.min(...generateOHLCData.map(d => d.low)) * 0.9) / (Math.max(...generateOHLCData.map(d => d.high)) * 1.1 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9)) * 400;
                            return `${x},${upperY}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="1"
                        opacity="0.6"
                    />
                    <polyline
                        points={atrLevels.map((level, i) => {
                            const x = 50 + i * 7;
                            const lowerY = 500 - ((level.lower - Math.min(...generateOHLCData.map(d => d.low)) * 0.9) / (Math.max(...generateOHLCData.map(d => d.high)) * 1.1 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9)) * 400;
                            return `${x},${lowerY}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="1"
                        opacity="0.6"
                    />
                    <polyline
                        points={atrLevels.map((level, i) => {
                            const x = 50 + i * 7;
                            const middleY = 500 - ((level.middle - Math.min(...generateOHLCData.map(d => d.low)) * 0.9) / (Math.max(...generateOHLCData.map(d => d.high)) * 1.1 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9)) * 400;
                            return `${x},${middleY}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                    />

                    {/* Trading Signals */}
                    {signals.map((signal, index) => {
                        const signalIndex = Math.min(signal.index || index, atrLevels.length - 1);
                        const x = 50 + signalIndex * 7;
                        const y = 500 - ((atrLevels[signalIndex]?.middle || 0 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9) / (Math.max(...generateOHLCData.map(d => d.high)) * 1.1 - Math.min(...generateOHLCData.map(d => d.low)) * 0.9)) * 400;
                        const color = signal.type.includes('up') ? '#22c55e' : signal.type.includes('down') ? '#ef4444' : '#f59e0b';
                        
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
                <h3>ATR Analysis</h3>
                
                <div className="current-values">
                    <div className="value-item">
                        <strong>Current ATR:</strong> ${atrData[atrData.length - 1]?.toFixed(2) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>Upper Band:</strong> ${atrLevels[atrLevels.length - 1]?.upper.toFixed(2) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>Lower Band:</strong> ${atrLevels[atrLevels.length - 1]?.lower.toFixed(2) || 'N/A'}
                    </div>
                    <div className="value-item">
                        <strong>Current Price:</strong> ${atrLevels[atrLevels.length - 1]?.middle.toFixed(2) || 'N/A'}
                    </div>
                </div>

                {positionSizing && (
                    <div className="position-sizing">
                        <h4>Position Sizing Recommendations</h4>
                        <div className="sizing-grid">
                            <div className="sizing-item">
                                <strong>Volatility:</strong> {positionSizing.volatility}%
                                <span className="sizing-label">Current market volatility</span>
                            </div>
                            <div className="sizing-item">
                                <strong>Stop Loss:</strong> ${positionSizing.stopLossDistance}
                                <span className="sizing-label">Recommended stop distance</span>
                            </div>
                            <div className="sizing-item">
                                <strong>Position Size:</strong> {positionSizing.recommendedPositionSize}%
                                <span className="sizing-label">Of portfolio per trade</span>
                            </div>
                            <div className="sizing-item">
                                <strong>Risk/Reward:</strong> 1:{positionSizing.riskRewardRatio}
                                <span className="sizing-label">Potential ratio</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="signals-summary">
                    <strong>ATR-Based Signals:</strong>
                    <ul>
                        {signals.slice(-5).map((signal, index) => (
                            <li key={index} className={signal.type}>
                                <span className="signal-type">{signal.type.toUpperCase()}</span>
                                <span className="signal-reason">{signal.reason}</span>
                                <span className="signal-strength">Strength: {signal.strength}</span>
                                <span className="signal-description">{signal.description}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="interpretation">
                    <h4>Professional Interpretation:</h4>
                    <ul>
                        <li><strong>ATR Bands:</strong> Dynamic support/resistance based on volatility</li>
                        <li><strong>Breakouts:</strong> Price breaking above/below bands indicates trend continuation</li>
                        <li><strong>Volatility Expansion:</strong> Increasing ATR suggests trend continuation</li>
                        <li><strong>Volatility Contraction:</strong> Decreasing ATR suggests potential reversal</li>
                        <li><strong>Position Sizing:</strong> Use ATR for dynamic stop losses and position sizing</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ATRIndicator; 