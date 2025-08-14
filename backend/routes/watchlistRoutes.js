const express = require('express');
const router = express.Router();

// Import the controller functions
const {
    addToWatchlist,
    getWatchlist,
    removeFromWatchlist
} = require('../controllers/watchlistController');

// Import our auth middleware
const protect = require('../middleware/authMiddleware');

// --- Define Routes ---
// Any request to these routes must first pass through the 'protect' middleware.
// If the token is valid, 'req.user' will be attached and the controller will run.
// If not, the middleware will send a 401 error.

router.route('/')
    .get(protect, getWatchlist)
    .post(protect, addToWatchlist);

router.route('/:symbol')
    .delete(protect, removeFromWatchlist);

module.exports = router;