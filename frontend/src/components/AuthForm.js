import React, { useState } from 'react';
import axios from 'axios';
import './AuthForm.css';

const AuthForm = ({ onLogin }) => {
    const [authData, setAuthData] = useState({ username: '', email: '', password: '' });
    const [isLoginView, setIsLoginView] = useState(true);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleAuthChange = (e) => {
        setAuthData({
            ...authData,
            [e.target.name]: e.target.value
        });
    };

    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });
        const url = isLoginView ? '/api/auth/login' : '/api/auth/register';
        const payload = isLoginView ? { email: authData.email, password: authData.password } : authData;

        try {
            const response = await axios.post(url, payload);
            setMessage({ type: 'success', text: response.data.message });

            if (isLoginView) {
                if (response.data.token) {
                    localStorage.setItem('token', response.data.token);
                }
                onLogin(response.data);
            } else {
                setIsLoginView(true);
                setAuthData({ username: '', email: '', password: '' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'An error occurred.' });
        }
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleAuthSubmit} className="auth-form">
                <h2>{isLoginView ? 'Login' : 'Register'}</h2>
                {!isLoginView && (
                    <input
                        name="username"
                        type="text"
                        placeholder="Username"
                        value={authData.username}
                        onChange={handleAuthChange}
                        required
                    />
                )}
                <input
                    name="email"
                    type="email"
                    placeholder="Email"
                    value={authData.email}
                    onChange={handleAuthChange}
                    required
                />
                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    value={authData.password}
                    onChange={handleAuthChange}
                    required
                />
                <button type="submit" className="auth-button">
                    {isLoginView ? 'Login' : 'Register'}
                </button>
                <button 
                    type="button" 
                    onClick={() => setIsLoginView(!isLoginView)}
                    className="switch-button"
                >
                    Switch to {isLoginView ? 'Register' : 'Login'}
                </button>
                {message.text && <p className={`message ${message.type}`}>{message.text}</p>}
            </form>
        </div>
    );
};

export default AuthForm; 