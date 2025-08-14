const express = require('express');
const router = express.Router();
const { getPortfolio, addTransaction, getTransactions, getPortfolioSummary } = require('../controllers/portfolioController');
const protect = require('../middleware/authMiddleware');

// All portfolio routes require authentication
router.use(protect);

router.get('/', getPortfolio);
router.get('/summary', getPortfolioSummary);
router.get('/transactions', getTransactions);
router.post('/transaction', addTransaction);

module.exports = router; 