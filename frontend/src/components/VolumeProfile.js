import React, { useState, useMemo } from 'react';
import './VolumeProfile.css';

const VolumeProfile = () => {
    const [period, setPeriod] = useState(20);
    const [volumeThreshold, setVolumeThreshold] = useState(0.8);

    // Generate realistic price and volume data
    const generateData = useMemo(() => {
        const data = [];
        let price = 100;
        let volume = 1000000;
        
        for (let i = 0; i < 100; i++) {
            // Price movement with trend
            const trend = Math.sin(i * 0.1) * 15;
            const noise = (Math.random() - 0.5) * 10;
            price += trend + noise;
            
            // Volume with clustering (high volume on big moves)
            const priceChange = Math.abs(trend + noise);
            if (priceChange > 8) {
                volume = Math.max(volume * 1.5, 2000000); // High volume on big moves
            } else {
                volume = Math.max(volume * 0.95, 500000); // Decay volume
            }
            
            data.push({
                price: Math.max(price, 50),
                volume: volume + (Math.random() - 0.5) * volume * 0.3,
                timestamp: i
            });
        }
        return data;
    }, []);

    // Calculate Volume Profile
    const volumeProfile = useMemo(() => {
        if (generateData.length < period) return [];

        const priceLevels = {};
        const recentData = generateData.slice(-period);
        
        // Group volume by price levels
        recentData.forEach(candle => {
            const priceLevel = Math.round(candle.price / 2) * 2; // Round to nearest $2
            if (!priceLevels[priceLevel]) {
                priceLevels[priceLevel] = { volume: 0, count: 0, prices: [] };
            }
            priceLevels[priceLevel].volume += candle.volume;
            priceLevels[priceLevel].count += 1;
            priceLevels[priceLevel].prices.push(candle.price);
        });

        // Convert to array and sort by price
        return Object.entries(priceLevels)
            .map(([price, data]) => ({
                price: Number(price),
                volume: data.volume,
                count: data.count,
                avgPrice: data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length
            }))
            .sort((a, b) => a.price - b.price);
    }, [generateData, period]);

    // Find POC (Point of Control) - highest volume level
    const poc = useMemo(() => {
        if (volumeProfile.length === 0) return null;
        return volumeProfile.reduce((max, level) => 
            level.volume > max.volume ? level : max
        );
    }, [volumeProfile]);

    // Calculate Value Area (70% of total volume)
    const valueArea = useMemo(() => {
        if (volumeProfile.length === 0) return { upper: 0, lower: 0 };
        
        const totalVolume = volumeProfile.reduce((sum, level) => sum + level.volume, 0);
        const targetVolume = totalVolume * 0.7;
        
        let currentVolume = 0;
        let upper = poc?.price || 0;
        let lower = poc?.price || 0;
        
        // Expand from POC until we reach 70% volume
        while (currentVolume < targetVolume) {
            const upperLevel = volumeProfile.find(level => level.price === upper + 2);
            const lowerLevel = volumeProfile.find(level => level.price === lower - 2);
            
            if (upperLevel && lowerLevel) {
                if (upperLevel.volume > lowerLevel.volume) {
                    currentVolume += upperLevel.volume;
                    upper += 2;
                } else {
                    currentVolume += lowerLevel.volume;
                    lower -= 2;
                }
            } else if (upperLevel) {
                currentVolume += upperLevel.volume;
                upper += 2;
            } else if (lowerLevel) {
                currentVolume += lowerLevel.volume;
                lower -= 2;
            } else {
                break;
            }
        }
        
        return { upper, lower };
    }, [volumeProfile, poc]);

    // Generate trading signals
    const signals = useMemo(() => {
        const signals = [];
        const currentPrice = generateData[generateData.length - 1]?.price;
        
        if (!currentPrice || !poc || !valueArea) return signals;
        
        // Price at POC (equilibrium)
        if (Math.abs(currentPrice - poc.price) < 2) {
            signals.push({ 
                type: 'equilibrium', 
                reason: 'Price at Point of Control', 
                strength: 'Medium',
                description: 'Price is at the highest volume level - potential reversal point'
            });
        }
        
        // Price above value area (overvalued)
        if (currentPrice > valueArea.upper) {
            signals.push({ 
                type: 'sell', 
                reason: 'Above Value Area', 
                strength: 'High',
                description: 'Price above 70% volume area - potential reversal down'
            });
        }
        
        // Price below value area (undervalued)
        if (currentPrice < valueArea.lower) {
            signals.push({ 
                type: 'buy', 
                reason: 'Below Value Area', 
                strength: 'High',
                description: 'Price below 70% volume area - potential reversal up'
            });
        }
        
        // Volume spike detection
        const recentVolume = generateData.slice(-5).reduce((sum, d) => sum + d.volume, 0) / 5;
        const avgVolume = generateData.reduce((sum, d) => sum + d.volume, 0) / generateData.length;
        
        if (recentVolume > avgVolume * 1.5) {
            signals.push({ 
                type: 'volume_spike', 
                reason: 'Volume Spike Detected', 
                strength: 'Medium',
                description: 'Unusually high volume - potential trend continuation'
            });
        }
        
        return signals;
    }, [generateData, poc, valueArea]);

    return (
        <div className="volume-profile">
            <div className="indicator-header">
                <h2>Volume Profile - Institutional Volume Analysis</h2>
                <p>Advanced volume analysis with POC, Value Area, and volume clustering detection</p>
            </div>

            <div className="controls">
                <div className="control-group">
                    <label>Analysis Period:</label>
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
                    <label>Volume Threshold:</label>
                    <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.1"
                        value={volumeThreshold}
                        onChange={(e) => setVolumeThreshold(Number(e.target.value))}
                    />
                    <span>{volumeThreshold}</span>
                </div>
            </div>

            <div className="chart-container">
                <div className="chart-layout">
                    {/* Price Chart */}
                    <div className="price-chart">
                        <svg width="600" height="400" className="price-svg">
                            {/* Grid */}
                            <defs>
                                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                                </pattern>
                            </defs>
                            <rect width="600" height="400" fill="url(#grid)" />

                            {/* Price Line */}
                            <polyline
                                points={generateData.map((d, i) => {
                                    const minPrice = Math.min(...generateData.map(d => d.price));
                                    const maxPrice = Math.max(...generateData.map(d => d.price));
                                    const normalizedPrice = ((d.price - minPrice) / (maxPrice - minPrice)) * 350;
                                    return `${50 + i * 5.5},${400 - normalizedPrice}`;
                                }).join(' ')}
                                fill="none"
                                stroke="#3b82f6"
                                strokeWidth="2"
                            />

                            {/* POC Line */}
                            {poc && (() => {
                                const minPrice = Math.min(...generateData.map(d => d.price));
                                const maxPrice = Math.max(...generateData.map(d => d.price));
                                const pocY = 400 - ((poc.price - minPrice) / (maxPrice - minPrice)) * 350;
                                return (
                                    <line 
                                        x1="50" y1={pocY}
                                        x2="550" y2={pocY}
                                        stroke="#f59e0b" strokeWidth="2" strokeDasharray="5,5" 
                                    />
                                );
                            })()}

                            {/* Value Area Lines */}
                            {valueArea && (() => {
                                const minPrice = Math.min(...generateData.map(d => d.price));
                                const maxPrice = Math.max(...generateData.map(d => d.price));
                                const upperY = 400 - ((valueArea.upper - minPrice) / (maxPrice - minPrice)) * 350;
                                const lowerY = 400 - ((valueArea.lower - minPrice) / (maxPrice - minPrice)) * 350;
                                return (
                                    <>
                                        <line 
                                            x1="50" y1={upperY}
                                            x2="550" y2={upperY}
                                            stroke="#22c55e" strokeWidth="1" strokeDasharray="3,3" 
                                        />
                                        <line 
                                            x1="50" y1={lowerY}
                                            x2="550" y2={lowerY}
                                            stroke="#22c55e" strokeWidth="1" strokeDasharray="3,3" 
                                        />
                                    </>
                                );
                            })()}

                            {/* Current Price Marker */}
                            <circle
                                cx="550"
                                cy={(() => {
                                    const minPrice = Math.min(...generateData.map(d => d.price));
                                    const maxPrice = Math.max(...generateData.map(d => d.price));
                                    const currentPrice = generateData[generateData.length - 1]?.price;
                                    return 400 - ((currentPrice - minPrice) / (maxPrice - minPrice)) * 350;
                                })()}
                                r="6"
                                fill="#ef4444"
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                        </svg>
                    </div>

                    {/* Volume Profile */}
                    <div className="volume-profile-chart">
                        <svg width="200" height="400" className="volume-svg">
                            {/* Volume Bars */}
                            {volumeProfile.map((level, i) => {
                                const maxVolume = Math.max(...volumeProfile.map(l => l.volume));
                                const barHeight = (level.volume / maxVolume) * 350;
                                const y = 400 - barHeight;
                                const isPOC = poc && Math.abs(level.price - poc.price) < 2;
                                const isInValueArea = valueArea && level.price >= valueArea.lower && level.price <= valueArea.upper;
                                
                                return (
                                    <g key={i}>
                                        <rect
                                            x={i * (180 / volumeProfile.length)}
                                            y={y}
                                            width={Math.max(2, 180 / volumeProfile.length - 1)}
                                            height={barHeight}
                                            fill={isPOC ? '#f59e0b' : isInValueArea ? '#22c55e' : '#3b82f6'}
                                            opacity={isPOC ? 1 : isInValueArea ? 0.8 : 0.6}
                                        />
                                        {isPOC && (
                                            <text
                                                x={i * (180 / volumeProfile.length) + 5}
                                                y={y - 5}
                                                fill="#f59e0b"
                                                fontSize="10"
                                                fontWeight="bold"
                                            >
                                                POC
                                            </text>
                                        )}
                                    </g>
                                );
                            })}

                            {/* Price Labels */}
                            {volumeProfile.filter((_, i) => i % 5 === 0).map((level, i) => (
                                <text
                                    key={i}
                                    x="210"
                                    y={400 - (i * 5 * (350 / Math.ceil(volumeProfile.length / 5)))}
                                    fill="#ffffff"
                                    fontSize="10"
                                >
                                    ${level.price}
                                </text>
                            ))}
                        </svg>
                    </div>
                </div>
            </div>

            <div className="analysis">
                <h3>Volume Profile Analysis</h3>
                
                <div className="key-levels">
                    <div className="level-item poc">
                        <strong>Point of Control (POC):</strong> ${poc?.price.toFixed(2) || 'N/A'}
                        <span className="level-description">Highest volume price level - equilibrium point</span>
                    </div>
                    <div className="level-item value-area">
                        <strong>Value Area:</strong> ${valueArea?.lower.toFixed(2) || 'N/A'} - ${valueArea?.upper.toFixed(2) || 'N/A'}
                        <span className="level-description">70% of volume occurs in this range</span>
                    </div>
                    <div className="level-item current-price">
                        <strong>Current Price:</strong> ${generateData[generateData.length - 1]?.price.toFixed(2) || 'N/A'}
                        <span className="level-description">Current market position</span>
                    </div>
                </div>

                <div className="volume-metrics">
                    <div className="metric-item">
                        <strong>Total Volume:</strong> {(volumeProfile.reduce((sum, level) => sum + level.volume, 0) / 1000000).toFixed(2)}M
                        <span className="metric-label">Period Total</span>
                    </div>
                    <div className="metric-item">
                        <strong>Volume Distribution:</strong> {volumeProfile.length} levels
                        <span className="metric-label">Price Levels</span>
                    </div>
                    <div className="metric-item">
                        <strong>Volume Concentration:</strong> {((poc?.volume || 0) / volumeProfile.reduce((sum, level) => sum + level.volume, 0) * 100).toFixed(1)}%
                        <span className="metric-label">POC Concentration</span>
                    </div>
                </div>

                <div className="signals-summary">
                    <strong>Volume-Based Signals:</strong>
                    <ul>
                        {signals.map((signal, index) => (
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
                        <li><strong>POC (Point of Control):</strong> Price level with highest volume - major support/resistance</li>
                        <li><strong>Value Area:</strong> 70% of volume occurs here - fair value range</li>
                        <li><strong>Above Value Area:</strong> Potential reversal down to value area</li>
                        <li><strong>Below Value Area:</strong> Potential reversal up to value area</li>
                        <li><strong>Volume Clustering:</strong> High volume confirms price levels</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default VolumeProfile; 