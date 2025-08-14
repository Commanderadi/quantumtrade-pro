const pool = require('../config/database');

exports.getAlerts = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ message: 'Failed to fetch alerts' });
    }
};

exports.createAlert = async (req, res) => {
    const { symbol, type, alert_type, target_value, is_active } = req.body;
    
    if (!symbol || !alert_type || !target_value) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const [result] = await pool.execute(
            'INSERT INTO alerts (user_id, symbol, type, alert_type, target_value, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.userId, symbol, type || 'stock', alert_type, target_value, is_active !== false]
        );
        
        const [newAlert] = await pool.execute(
            'SELECT * FROM alerts WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json(newAlert[0]);
    } catch (error) {
        console.error('Error creating alert:', error);
        res.status(500).json({ message: 'Failed to create alert' });
    }
};

exports.updateAlert = async (req, res) => {
    const { id } = req.params;
    const { symbol, type, alert_type, target_value, is_active } = req.body;
    
    try {
        // Verify the alert belongs to the user
        const [existingAlert] = await pool.execute(
            'SELECT * FROM alerts WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        
        if (existingAlert.length === 0) {
            return res.status(404).json({ message: 'Alert not found' });
        }
        
        await pool.execute(
            'UPDATE alerts SET symbol = ?, type = ?, alert_type = ?, target_value = ?, is_active = ? WHERE id = ? AND user_id = ?',
            [symbol, type, alert_type, target_value, is_active, id, req.user.userId]
        );
        
        const [updatedAlert] = await pool.execute(
            'SELECT * FROM alerts WHERE id = ?',
            [id]
        );
        
        res.json(updatedAlert[0]);
    } catch (error) {
        console.error('Error updating alert:', error);
        res.status(500).json({ message: 'Failed to update alert' });
    }
};

exports.deleteAlert = async (req, res) => {
    const { id } = req.params;
    
    try {
        const [result] = await pool.execute(
            'DELETE FROM alerts WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Alert not found' });
        }
        
        res.json({ message: 'Alert deleted successfully' });
    } catch (error) {
        console.error('Error deleting alert:', error);
        res.status(500).json({ message: 'Failed to delete alert' });
    }
};

exports.toggleAlert = async (req, res) => {
    const { id } = req.params;
    
    try {
        // Get current alert status
        const [alert] = await pool.execute(
            'SELECT is_active FROM alerts WHERE id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        
        if (alert.length === 0) {
            return res.status(404).json({ message: 'Alert not found' });
        }
        
        const newStatus = !alert[0].is_active;
        
        await pool.execute(
            'UPDATE alerts SET is_active = ? WHERE id = ? AND user_id = ?',
            [newStatus, id, req.user.userId]
        );
        
        res.json({ is_active: newStatus });
    } catch (error) {
        console.error('Error toggling alert:', error);
        res.status(500).json({ message: 'Failed to toggle alert' });
    }
};

exports.checkAlerts = async (req, res) => {
    try {
        // Get all active alerts for the user
        const [alerts] = await pool.execute(
            'SELECT * FROM alerts WHERE user_id = ? AND is_active = 1',
            [req.user.userId]
        );
        
        const triggeredAlerts = [];
        
        // For each alert, check if it should be triggered
        // This is a simplified version - in a real app, you'd check current prices
        for (const alert of alerts) {
            // Mock check - in reality, you'd fetch current price and compare
            const shouldTrigger = Math.random() > 0.8; // 20% chance for demo
            
            if (shouldTrigger) {
                triggeredAlerts.push({
                    id: alert.id,
                    symbol: alert.symbol,
                    type: alert.type,
                    alert_type: alert.alert_type,
                    target_value: alert.target_value,
                    message: `Alert triggered for ${alert.symbol}`
                });
            }
        }
        
        res.json(triggeredAlerts);
    } catch (error) {
        console.error('Error checking alerts:', error);
        res.status(500).json({ message: 'Failed to check alerts' });
    }
}; 