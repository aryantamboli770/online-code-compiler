// src/routes/code.js
const express = require('express');
const CodeController = require('../controllers/codeController');
const AuthMiddleware = require('../middleware/auth');
const RateLimiterMiddleware = require('../middleware/rateLimiter');
const ValidationMiddleware = require('../middleware/validation');

const router = express.Router();

// Apply session management to all routes
router.use(AuthMiddleware.manageSession);

// Apply general rate limiting
router.use(RateLimiterMiddleware.createGeneralLimiter());

// Apply input sanitization
router.use(ValidationMiddleware.sanitizeInput);

// Execute code - main endpoint
router.post('/execute',
    RateLimiterMiddleware.createExecutionLimiter(),
    AuthMiddleware.optionalAuth,
    AuthMiddleware.checkExecutionLimits,
    ValidationMiddleware.validateCodeExecution(),
    CodeController.executeCode
);

// Get execution history (requires authentication)
router.get('/history',
    AuthMiddleware.verifyToken,
    ValidationMiddleware.validatePagination(),
    ValidationMiddleware.validateLanguageFilter(),
    CodeController.getExecutionHistory
);

// Get specific execution by ID
router.get('/execution/:executionId',
    AuthMiddleware.optionalAuth,
    ValidationMiddleware.validateExecutionId(),
    CodeController.getExecutionById
);

// Delete execution (requires authentication)
router.delete('/execution/:executionId',
    AuthMiddleware.verifyToken,
    ValidationMiddleware.validateExecutionId(),
    CodeController.deleteExecution
);

// Kill running execution
router.post('/execution/:executionId/kill',
    AuthMiddleware.optionalAuth,
    ValidationMiddleware.validateExecutionId(),
    CodeController.killExecution
);

// Get execution statistics
router.get('/statistics',
    AuthMiddleware.optionalAuth,
    ValidationMiddleware.validateTimeRange(),
    CodeController.getExecutionStatistics
);

// Get supported languages (public endpoint)
router.get('/languages',
    CodeController.getSupportedLanguages
);

// Get code templates for a specific language (public endpoint)
router.get('/templates/:language',
    ValidationMiddleware.validateLanguageFilter(),
    CodeController.getCodeTemplates
);

// Admin routes
router.get('/admin/statistics',
    AuthMiddleware.verifyToken,
    AuthMiddleware.requireAdmin,
    ValidationMiddleware.validateTimeRange(),
    CodeController.getGlobalStatistics
);

router.post('/admin/cleanup',
    AuthMiddleware.verifyToken,
    AuthMiddleware.requireAdmin,
    CodeController.cleanupOldExecutions
);

module.exports = router;