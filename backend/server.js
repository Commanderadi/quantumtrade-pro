require('dotenv').config();
const express = require('express');
const app = express();

// --- Import Routes ---
// This imports the user registration and login routes from Phase 1
const authRoutes = require('./routes/authRoutes');
// This imports the new stock data routes we created in Phase 2
const stockRoutes = require('./routes/stockRoutes');
const watchlistRoutes = require('./routes/watchlistRoutes'); 
// This imports the new crypto data routes
const cryptoRoutes = require('./routes/cryptoRoutes');
// This imports the portfolio management routes
const portfolioRoutes = require('./routes/portfolioRoutes');
// This imports the alert management routes
const alertRoutes = require('./routes/alertRoutes');
// This imports the AI-powered features routes
const aiRoutes = require('./routes/aiRoutes');

// Use the port from our .env file, or default to 5000
const PORT = process.env.PORT || 5000;

// --- Middleware ---
// This allows our server to accept and parse JSON in request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- API Routes ---
// A simple welcome route to confirm the API is running
app.get('/api', (req, res) => {
    res.json({ message: 'Welcome to the Stock & Crypto Platform API!' });
});

// Mount the authentication routes under the `/api/auth` path
app.use('/api/auth', authRoutes);

// Mount the new stock routes under the `/api/stocks` path
app.use('/api/stocks', stockRoutes);
app.use('/api/watchlist', watchlistRoutes);

// Mount the new crypto routes under the `/api/crypto` path
app.use('/api/crypto', cryptoRoutes);

// Mount the portfolio routes under the `/api/portfolio` path
app.use('/api/portfolio', portfolioRoutes);
// Mount the alert routes under the `/api/alerts` path
app.use('/api/alerts', alertRoutes);
// Mount the AI routes under the `/api/ai` path
app.use('/api/ai', aiRoutes);


// --- Start Server ---
// This command starts our backend server and listens for requests
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});