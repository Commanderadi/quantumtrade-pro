const express = require('express');
const router = express.Router();
const { 
    getPortfolioInsights, 
    getTradingSignals, 
    getSentimentAnalysis, 
    processNaturalLanguageQuery, 
    getPredictions 
} = require('../controllers/aiController');
const protect = require('../middleware/authMiddleware');

// All routes are protected by authentication
router.use(protect);

// Get AI-powered portfolio insights and recommendations
router.get('/insights', getPortfolioInsights);

// Get automated trading signals for a symbol
router.get('/signals', getTradingSignals);

// Get market sentiment analysis for a symbol
router.get('/sentiment', getSentimentAnalysis);

// Process natural language queries
router.post('/query', processNaturalLanguageQuery);

// Get predictive analytics for a symbol
router.get('/predictions', getPredictions);

module.exports = router; 