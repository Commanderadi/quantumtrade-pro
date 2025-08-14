const express = require('express');
const router = express.Router();
const { 
    getAlerts, 
    createAlert, 
    updateAlert, 
    deleteAlert, 
    toggleAlert, 
    checkAlerts 
} = require('../controllers/alertController');
const protect = require('../middleware/authMiddleware');

// All routes are protected by authentication
router.use(protect);

// Get all alerts for the user
router.get('/', getAlerts);

// Create a new alert
router.post('/', createAlert);

// Update an alert
router.put('/:id', updateAlert);

// Delete an alert
router.delete('/:id', deleteAlert);

// Toggle alert active status
router.patch('/:id/toggle', toggleAlert);

// Check for triggered alerts
router.get('/check', checkAlerts);

module.exports = router; 