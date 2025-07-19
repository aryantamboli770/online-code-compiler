// src/routes/user.js
const express = require('express');
const UserController = require('../controllers/userController');
const AuthMiddleware = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');

const router = express.Router();

// All user routes require authentication
router.use(AuthMiddleware.verifyToken);

// Apply input sanitization
router.use(ValidationMiddleware.sanitizeInput);

// Get user profile
router.get('/profile', UserController.getProfile);

// Update user profile
router.put('/profile',
    ValidationMiddleware.validateUserPreferences(),
    UserController.updateProfile
);

// Update user preferences
router.put('/preferences',
    ValidationMiddleware.validateUserPreferences(),
    UserController.updatePreferences
);

// Change password
router.put('/password',
    ValidationMiddleware.validateUserPreferences(),
    UserController.changePassword
);

// Delete user account
router.delete('/account',
    ValidationMiddleware.validateUserPreferences(),
    UserController.deleteAccount
);

// Get user statistics
router.get('/statistics',
    ValidationMiddleware.validateTimeRange(),
    UserController.getUserStatistics
);

module.exports = router;