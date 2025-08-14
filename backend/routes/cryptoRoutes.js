const express = require('express');
const router = express.Router();
const { getCryptoPrice, getCryptoInfo, getTopCryptos } = require('../controllers/cryptoController');

router.get('/price/:symbol', getCryptoPrice);
router.get('/info/:symbol', getCryptoInfo);
router.get('/top', getTopCryptos);

module.exports = router; 