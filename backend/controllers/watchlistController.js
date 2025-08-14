const db = require('../config/database.js'); // Your database connection pool

// @desc    Add a stock to the user's watchlist
// @route   POST /api/watchlist
// @access  Private
exports.addToWatchlist = async (req, res) => {
    const { symbol } = req.body;
    // req.user.id comes from our 'protect' middleware
    const userId = req.user.id;

    if (!symbol) {
        return res.status(400).json({ message: 'Stock symbol is required.' });
    }

    try {
        const query = 'INSERT INTO watchlists (user_id, stock_symbol) VALUES (?, ?)';
        await db.query(query, [userId, symbol.toUpperCase()]);
        res.status(201).json({ message: `${symbol.toUpperCase()} added to watchlist.` });
    } catch (error) {
        // MySQL error code 1062 is for duplicate entry
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This stock is already in your watchlist.' });
        }
        console.error('Database Error:', error);
        res.status(500).json({ message: 'Server error while adding to watchlist.' });
    }
};

// @desc    Get the user's watchlist
// @route   GET /api/watchlist
// @access  Private
exports.getWatchlist = async (req, res) => {
    const userId = req.user.id;

    try {
        const query = 'SELECT stock_symbol FROM watchlists WHERE user_id = ? ORDER BY created_at ASC';
        const [rows] = await db.query(query, [userId]);
        // We map to return an array of strings like ['AAPL', 'GOOGL'] for simplicity
        const watchlist = rows.map(row => row.stock_symbol);
        res.status(200).json(watchlist);
    } catch (error) {
        console.error('Database Error:', error);
        res.status(500).json({ message: 'Server error while fetching watchlist.' });
    }
};

// @desc    Remove a stock from the user's watchlist
// @route   DELETE /api/watchlist/:symbol
// @access  Private
exports.removeFromWatchlist = async (req, res) => {
    const { symbol } = req.params;
    const userId = req.user.id;

    try {
        const query = 'DELETE FROM watchlists WHERE user_id = ? AND stock_symbol = ?';
        const [result] = await db.query(query, [userId, symbol.toUpperCase()]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Stock not found in your watchlist.' });
        }

        res.status(200).json({ message: `${symbol.toUpperCase()} removed from watchlist.` });
    } catch (error) {
        console.error('Database Error:', error);
        res.status(500).json({ message: 'Server error while removing from watchlist.' });
    }
};