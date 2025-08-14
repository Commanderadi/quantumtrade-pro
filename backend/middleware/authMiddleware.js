const jwt = require('jsonwebtoken');

// Middleware to protect routes
const protect = (req, res, next) => {
    // Get the token from the header. We'll send it as 'x-auth-token'.
    const token = req.header('x-auth-token');

    // Check if no token is provided
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    try {
        // Verify the token using our JWT_SECRET
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Add the user payload from the token to the request object
        req.user = decoded;
        
        // Call the next piece of middleware or the route's controller
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid.' });
    }
};

module.exports = protect;