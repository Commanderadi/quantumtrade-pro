const express = require('express');
const router = express.Router();
const { getStockPrice, getStockInfo } = require('../controllers/stockController');

// We will add authentication middleware here in a later phase
router.get('/price/:symbol', getStockPrice);
router.get('/info/:symbol', getStockInfo);

module.exports = router;