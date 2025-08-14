import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaBell, FaPlus, FaTrash, FaEdit, FaCheck, FaTimes, FaChartLine, FaBitcoin } from 'react-icons/fa';
import './PriceAlerts.css';

const PriceAlerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingAlert, setEditingAlert] = useState(null);
    const [formData, setFormData] = useState({
        symbol: '',
        type: 'stock',
        alert_type: 'price_above',
        target_value: '',
        is_active: true
    });

    const alertTypes = [
        { label: 'Price Above', value: 'price_above' },
        { label: 'Price Below', value: 'price_below' },
        { label: 'Percent Change', value: 'percent_change' }
    ];

    const assetTypes = [
        { label: 'Stock', value: 'stock', icon: <FaChartLine /> },
        { label: 'Cryptocurrency', value: 'crypto', icon: <FaBitcoin /> }
    ];

    useEffect(() => {
        fetchAlerts();
    }, []);

    const fetchAlerts = async () => {
        setLoading(true);
        setError('');
        
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('/api/alerts', {
                headers: { 'x-auth-token': token }
            });
            setAlerts(response.data);
        } catch (err) {
            setError('Failed to fetch alerts');
            console.error('Alerts fetch error:', err);
        } finally {
            setLoading(false);
        }
    };



    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.symbol || !formData.target_value) {
            setError('Please fill in all required fields');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            
            if (editingAlert) {
                // Update existing alert
                const response = await axios.put(`/api/alerts/${editingAlert.id}`, formData, {
                    headers: { 'x-auth-token': token }
                });
                setAlerts(prev => prev.map(alert => 
                    alert.id === editingAlert.id ? response.data : alert
                ));
            } else {
                // Create new alert
                const response = await axios.post('/api/alerts', formData, {
                    headers: { 'x-auth-token': token }
                });
                setAlerts(prev => [...prev, response.data]);
            }

            // Reset form
            setFormData({
                symbol: '',
                type: 'stock',
                alert_type: 'price_above',
                target_value: '',
                is_active: true
            });
            setShowForm(false);
            setEditingAlert(null);
            setError('');
        } catch (err) {
            setError('Failed to save alert');
            console.error('Alert save error:', err);
        }
    };

    const handleEdit = (alert) => {
        setEditingAlert(alert);
        setFormData({
            symbol: alert.symbol,
            type: alert.type,
            alert_type: alert.alert_type,
            target_value: alert.target_value.toString(),
            is_active: alert.is_active
        });
        setShowForm(true);
    };

    const handleDelete = async (alertId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/alerts/${alertId}`, {
                headers: { 'x-auth-token': token }
            });
            setAlerts(prev => prev.filter(alert => alert.id !== alertId));
        } catch (err) {
            setError('Failed to delete alert');
            console.error('Alert delete error:', err);
        }
    };

    const handleToggleActive = async (alertId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.patch(`/api/alerts/${alertId}/toggle`, {}, {
                headers: { 'x-auth-token': token }
            });
            setAlerts(prev => prev.map(alert => 
                alert.id === alertId 
                    ? { ...alert, is_active: response.data.is_active }
                    : alert
            ));
        } catch (err) {
            setError('Failed to update alert');
            console.error('Alert update error:', err);
        }
    };

    const getAlertStatus = (alert) => {
        if (!alert.is_active) return 'inactive';
        if (alert.triggered) return 'triggered';
        return 'active';
    };

    const getAlertDescription = (alert) => {
        const symbol = alert.symbol;
        const value = `$${alert.target_value.toLocaleString()}`;
        
        switch (alert.alert_type) {
            case 'price_above':
                return `Alert when ${symbol} goes above ${value}`;
            case 'price_below':
                return `Alert when ${symbol} goes below ${value}`;
            case 'percent_change':
                return `Alert when ${symbol} changes by ${alert.target_value}%`;
            default:
                return `Alert for ${symbol}`;
        }
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString();
    };

    return (
        <div className="price-alerts-container">
            <div className="alerts-header">
                <h2>
                    <FaBell /> Smart Price Alerts
                </h2>
                <button 
                    className="add-alert-btn"
                    onClick={() => {
                        setShowForm(true);
                        setEditingAlert(null);
                        setFormData({
                            symbol: '',
                            type: 'stock',
                            alert_type: 'price_above',
                            target_value: '',
                            is_active: true
                        });
                    }}
                >
                    <FaPlus /> Add Alert
                </button>
            </div>

            {error && (
                <div className="alert-error">
                    <p>{error}</p>
                    <button onClick={() => setError('')}>Dismiss</button>
                </div>
            )}

            {showForm && (
                <div className="alert-form-overlay">
                    <div className="alert-form">
                        <div className="form-header">
                            <h3>{editingAlert ? 'Edit Alert' : 'Create New Alert'}</h3>
                            <button 
                                className="close-btn"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditingAlert(null);
                                    setError('');
                                }}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Asset Type</label>
                                <div className="asset-type-buttons">
                                    {assetTypes.map(type => (
                                        <button
                                            key={type.value}
                                            type="button"
                                            className={`asset-type-btn ${formData.type === type.value ? 'active' : ''}`}
                                            onClick={() => setFormData(prev => ({ ...prev, type: type.value }))}
                                        >
                                            {type.icon} {type.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Symbol</label>
                                <input
                                    type="text"
                                    name="symbol"
                                    value={formData.symbol}
                                    onChange={handleInputChange}
                                    placeholder={formData.type === 'stock' ? 'e.g., AAPL' : 'e.g., BTC'}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Alert Type</label>
                                <select
                                    name="alert_type"
                                    value={formData.alert_type}
                                    onChange={handleInputChange}
                                    required
                                >
                                    {alertTypes.map(type => (
                                        <option key={type.value} value={type.value}>
                                            {type.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Target Value</label>
                                <input
                                    type="number"
                                    name="target_value"
                                    value={formData.target_value}
                                    onChange={handleInputChange}
                                    placeholder={formData.alert_type === 'percent_change' ? '5.0' : '150.00'}
                                    step="0.01"
                                    required
                                />
                            </div>

                            <div className="form-group checkbox-group">
                                <label>
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={formData.is_active}
                                        onChange={handleInputChange}
                                    />
                                    Active Alert
                                </label>
                            </div>

                            <div className="form-actions">
                                <button type="button" onClick={() => setShowForm(false)}>
                                    Cancel
                                </button>
                                <button type="submit">
                                    {editingAlert ? 'Update Alert' : 'Create Alert'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {loading && (
                <div className="alerts-loading">
                    <div className="spinner"></div>
                    <p>Loading alerts...</p>
                </div>
            )}

            {!loading && (
                <div className="alerts-list">
                    {alerts.length === 0 ? (
                        <div className="no-alerts">
                            <FaBell />
                            <p>No price alerts set</p>
                            <span>Create your first alert to get notified about price movements</span>
                        </div>
                    ) : (
                        alerts.map(alert => (
                            <div key={alert.id} className={`alert-card ${getAlertStatus(alert)}`}>
                                <div className="alert-header">
                                    <div className="alert-symbol">
                                        {alert.type === 'crypto' ? <FaBitcoin /> : <FaChartLine />}
                                        <span>{alert.symbol}</span>
                                    </div>
                                    <div className="alert-status">
                                        <span className={`status-badge ${getAlertStatus(alert)}`}>
                                            {getAlertStatus(alert)}
                                        </span>
                                    </div>
                                </div>

                                <div className="alert-content">
                                    <p className="alert-description">
                                        {getAlertDescription(alert)}
                                    </p>
                                    <div className="alert-meta">
                                        <span>Created: {formatDate(alert.created_at)}</span>
                                        {alert.current_price > 0 && (
                                            <span>Current: ${alert.current_price.toLocaleString()}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="alert-actions">
                                    <button
                                        className={`toggle-btn ${alert.is_active ? 'active' : ''}`}
                                        onClick={() => handleToggleActive(alert.id)}
                                        title={alert.is_active ? 'Deactivate' : 'Activate'}
                                    >
                                        {alert.is_active ? <FaCheck /> : <FaTimes />}
                                    </button>
                                    <button
                                        className="edit-btn"
                                        onClick={() => handleEdit(alert)}
                                        title="Edit"
                                    >
                                        <FaEdit />
                                    </button>
                                    <button
                                        className="delete-btn"
                                        onClick={() => handleDelete(alert.id)}
                                        title="Delete"
                                    >
                                        <FaTrash />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default PriceAlerts; 