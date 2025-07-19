// src/routes/admin.js
const express = require('express');
const AdminController = require('../controllers/adminController');
const AuthMiddleware = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(AuthMiddleware.verifyToken);
router.use(AuthMiddleware.requireAdmin);

// Apply input sanitization
router.use(ValidationMiddleware.sanitizeInput);

// Get global statistics
router.get('/statistics',
    ValidationMiddleware.validateTimeRange(),
    AdminController.getGlobalStatistics
);

// Get all users
router.get('/users',
    ValidationMiddleware.validatePagination(),
    AdminController.getAllUsers
);

// Get specific user
router.get('/users/:userId',
    ValidationMiddleware.validateExecutionId(),
    AdminController.getUserById
);

// Update user (admin can modify any user)
router.put('/users/:userId',
    ValidationMiddleware.validateExecutionId(),
    ValidationMiddleware.validateUserPreferences(),
    AdminController.updateUser
);

// Delete user
router.delete('/users/:userId',
    ValidationMiddleware.validateExecutionId(),
    AdminController.deleteUser
);

// Get all executions
router.get('/executions',
    ValidationMiddleware.validatePagination(),
    ValidationMiddleware.validateLanguageFilter(),
    AdminController.getAllExecutions
);

// Get specific execution
router.get('/executions/:executionId',
    ValidationMiddleware.validateExecutionId(),
    AdminController.getExecutionById
);

// Delete execution
router.delete('/executions/:executionId',
    ValidationMiddleware.validateExecutionId(),
    AdminController.deleteExecution
);

// System maintenance
router.post('/cleanup/executions',
    AdminController.cleanupOldExecutions
);

router.post('/cleanup/sessions',
    AdminController.cleanupExpiredSessions
);

// System controls
router.post('/system/restart',
    AdminController.restartSystem
);

router.post('/docker/cleanup',
    AdminController.cleanupDockerContainers
);

module.exports = router;