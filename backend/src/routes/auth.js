// src/routes/auth.js
const express = require('express');
const AuthController = require('../controllers/authController');
const AuthMiddleware = require('../middleware/auth');
const RateLimiterMiddleware = require('../middleware/rateLimiter');
const ValidationMiddleware = require('../middleware/validation');

const router = express.Router();

// Apply session management
router.use(AuthMiddleware.manageSession);

// Apply input sanitization
router.use(ValidationMiddleware.sanitizeInput);

// User registration
router.post('/register',
    RateLimiterMiddleware.createAuthLimiter(),
    ValidationMiddleware.validateUserRegistration(),
    AuthController.register
);

// User login
router.post('/login',
    RateLimiterMiddleware.createAuthLimiter(),
    ValidationMiddleware.validateUserLogin(),
    AuthController.login
);

// User logout (requires authentication)
router.post('/logout',
    AuthMiddleware.verifyToken,
    AuthController.logout
);

// Refresh access token
router.post('/refresh',
    RateLimiterMiddleware.createAuthLimiter(),
    AuthController.refreshToken
);

// Get current user info (requires authentication)
router.get('/me',
    AuthMiddleware.verifyToken,
    AuthController.getCurrentUser
);

// Verify token (utility endpoint)
router.post('/verify',
    AuthMiddleware.verifyToken,
    (req, res) => {
        res.json({
            success: true,
            message: 'Token is valid',
            user: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email,
                role: req.user.role
            }
        });
    }
);

module.exports = router;