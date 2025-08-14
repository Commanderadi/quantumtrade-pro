import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import axios from 'axios';
import { ThemeProvider } from './ThemeContext';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import Portfolio from './components/Portfolio';
import Crypto from './components/Crypto';
import Navigation from './components/Navigation';
import ThemeToggle from './components/ThemeToggle';
import RSIIndicator from './components/RSIIndicator';
import MACDIndicator from './components/MACDIndicator';
import BollingerBands from './components/BollingerBands';
import VolumeProfile from './components/VolumeProfile';
import ATRIndicator from './components/ATRIndicator';
import LiveMarketDashboard from './components/LiveMarketDashboard';

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
        <ThemeProvider>
            <Router>
                <div className="App">
                    {isLoggedIn ? (
                        <div className="app-layout">
                            <Navigation onLogout={handleLogout} user={user} />
                            <main className="main-content">
                                <div className="content-header">
                                    <ThemeToggle />
                                </div>
                                <div className="content-body">
                                    <Routes>
                                        <Route path="/dashboard" element={<Dashboard />} />
                                        <Route path="/portfolio" element={<Portfolio />} />
                                        <Route path="/crypto" element={<Crypto />} />
                                        <Route path="/rsi" element={<RSIIndicator />} />
                                        <Route path="/macd" element={<MACDIndicator />} />
                                        <Route path="/bollinger-bands" element={<BollingerBands />} />
                                        <Route path="/volume-profile" element={<VolumeProfile />} />
                                        <Route path="/atr" element={<ATRIndicator />} />
                                        <Route path="/live-market" element={<LiveMarketDashboard />} />
                                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                    </Routes>
                                </div>
                            </main>
                        </div>
                    ) : (
                        <div className="auth-container">
                            <AuthForm onLogin={handleLogin} />
                        </div>
                    )}
                </div>
            </Router>
        </ThemeProvider>
    );
}

export default App;