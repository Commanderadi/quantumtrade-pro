import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import axios from 'axios';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import Portfolio from './components/Portfolio';
import Crypto from './components/Crypto';
import Navigation from './components/Navigation';
import News from './components/News';
import PriceAlerts from './components/PriceAlerts';
import AIInsights from './components/AIInsights';
import TradingSignals from './components/TradingSignals';
import NaturalLanguageQuery from './components/NaturalLanguageQuery';
import SentimentAnalysis from './components/SentimentAnalysis';
import MarketIntelligenceHub from './components/PredictiveAnalytics';
import IndianMarkets from './components/IndianMarkets';
import { FaChartLine, FaRocket, FaShieldAlt } from 'react-icons/fa';

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
    const [user, setUser] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            // Verify token and get user info
            fetchUserProfile();
        }
    }, []);

    const fetchUserProfile = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('/api/auth/profile', {
                headers: { 'x-auth-token': token }
            });
            setUser(response.data);
        } catch (error) {
            console.error('Failed to fetch user profile:', error);
            handleLogout();
        }
    };

    const handleLogin = (userData) => {
        setIsLoggedIn(true);
        setUser(userData.user);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setUser(null);
    };

    return (
        <Router>
            <div className="App">
                <header className="app-header">
                    <div className="header-content">
                        <div className="logo-section">
                            <FaRocket className="logo-icon" />
                            <h1>QuantumTrade Pro</h1>
                        </div>
                        <p className="tagline">Advanced Financial Intelligence Platform</p>
                    </div>
                </header>
                {isLoggedIn ? (
                    <>
                        <Navigation onLogout={handleLogout} user={user} />
                        <Routes>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/portfolio" element={<Portfolio />} />
                            <Route path="/crypto" element={<Crypto />} />
                            <Route path="/indian-markets" element={<IndianMarkets />} />
                            <Route path="/news" element={<News />} />
                            <Route path="/alerts" element={<PriceAlerts />} />
                            <Route path="/ai-insights" element={<AIInsights />} />
                            <Route path="/trading-signals" element={<TradingSignals />} />
                            <Route path="/nl-query" element={<NaturalLanguageQuery />} />
                            <Route path="/sentiment" element={<SentimentAnalysis />} />
                            <Route path="/predictions" element={<MarketIntelligenceHub />} />
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        </Routes>
                    </>
                ) : (
                    <AuthForm onLogin={handleLogin} />
                )}
            </div>
        </Router>
    );
}

export default App;