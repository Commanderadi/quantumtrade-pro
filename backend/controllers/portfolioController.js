const pool = require('../config/database');

// Get user's portfolio
exports.getPortfolio = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM portfolios WHERE user_id = ? ORDER BY symbol',
            [req.user.userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Portfolio fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch portfolio.' });
    }
};

// Add a transaction (buy/sell)
exports.addTransaction = async (req, res) => {
    const { symbol, type, transaction_type, quantity, price_per_unit } = req.body;
    
    if (!symbol || !type || !transaction_type || !quantity || !price_per_unit) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const total_amount = quantity * price_per_unit;

    try {
        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Insert transaction record
            await connection.execute(
                'INSERT INTO transactions (user_id, symbol, type, transaction_type, quantity, price_per_unit, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.user.userId, symbol.toUpperCase(), type, transaction_type, quantity, price_per_unit, total_amount]
            );

            // Update portfolio
            const [existingPortfolio] = await connection.execute(
                'SELECT * FROM portfolios WHERE user_id = ? AND symbol = ? AND type = ?',
                [req.user.userId, symbol.toUpperCase(), type]
            );

            if (existingPortfolio.length > 0) {
                const current = existingPortfolio[0];
                let newQuantity, newAveragePrice;

                if (transaction_type === 'buy') {
                    newQuantity = parseFloat(current.quantity) + parseFloat(quantity);
                    newAveragePrice = ((parseFloat(current.quantity) * parseFloat(current.average_price)) + total_amount) / newQuantity;
                } else {
                    newQuantity = parseFloat(current.quantity) - parseFloat(quantity);
                    if (newQuantity <= 0) {
                        // Remove from portfolio if quantity becomes 0 or negative
                        await connection.execute(
                            'DELETE FROM portfolios WHERE user_id = ? AND symbol = ? AND type = ?',
                            [req.user.userId, symbol.toUpperCase(), type]
                        );
                    } else {
                        newAveragePrice = parseFloat(current.average_price); // Keep same average price for sells
                    }
                }

                if (newQuantity > 0) {
                    await connection.execute(
                        'UPDATE portfolios SET quantity = ?, average_price = ? WHERE user_id = ? AND symbol = ? AND type = ?',
                        [newQuantity, newAveragePrice, req.user.userId, symbol.toUpperCase(), type]
                    );
                }
            } else if (transaction_type === 'buy') {
                // Add new portfolio entry for buy transactions
                await connection.execute(
                    'INSERT INTO portfolios (user_id, symbol, type, quantity, average_price) VALUES (?, ?, ?, ?, ?)',
                    [req.user.userId, symbol.toUpperCase(), type, quantity, price_per_unit]
                );
            }

            await connection.commit();
            connection.release();

            res.status(201).json({ message: 'Transaction added successfully.' });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Transaction error:', error);
        res.status(500).json({ message: 'Failed to add transaction.' });
    }
};

// Get transaction history
exports.getTransactions = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC',
            [req.user.userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Transactions fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch transactions.' });
    }
};

// Get portfolio summary with current values
exports.getPortfolioSummary = async (req, res) => {
    try {
        const [portfolio] = await pool.execute(
            'SELECT * FROM portfolios WHERE user_id = ?',
            [req.user.userId]
        );

        let totalInvested = 0;
        let totalCurrentValue = 0;

        for (const holding of portfolio) {
            const invested = parseFloat(holding.quantity) * parseFloat(holding.average_price);
            totalInvested += invested;
            // Note: Current value calculation would require real-time price data
            // This is a placeholder - in a real app, you'd fetch current prices
            totalCurrentValue += invested; // Placeholder
        }

        const summary = {
            totalHoldings: portfolio.length,
            totalInvested: totalInvested.toFixed(2),
            totalCurrentValue: totalCurrentValue.toFixed(2),
            totalGainLoss: (totalCurrentValue - totalInvested).toFixed(2),
            totalGainLossPercent: totalInvested > 0 ? (((totalCurrentValue - totalInvested) / totalInvested) * 100).toFixed(2) : '0'
        };

        res.json(summary);
    } catch (error) {
        console.error('Portfolio summary error:', error);
        res.status(500).json({ message: 'Failed to fetch portfolio summary.' });
    }
}; 