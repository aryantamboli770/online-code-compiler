// src/middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');
const { SUPPORTED_LANGUAGES, MAX_CODE_LENGTH, MAX_INPUT_LENGTH } = require('../utils/constants');
const logger = require('../utils/logger');

class ValidationMiddleware {
    // Handle validation errors
    static handleValidationErrors(req, res, next) {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            logger.warn('Validation failed', {
                errors: errors.array(),
                ip: req.ip,
                endpoint: req.originalUrl,
                userId: req.user?.id
            });

            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(error => ({
                    field: error.path,
                    message: error.msg,
                    value: error.value
                }))
            });
        }

        next();
    }

    // Code execution validation rules
    static validateCodeExecution() {
        return [
            body('language')
                .isIn(Object.values(SUPPORTED_LANGUAGES))
                .withMessage(`Language must be one of: ${Object.values(SUPPORTED_LANGUAGES).join(', ')}`),

            body('code')
                .notEmpty()
                .withMessage('Code is required')
                .isLength({ min: 1, max: MAX_CODE_LENGTH })
                .withMessage(`Code must be between 1 and ${MAX_CODE_LENGTH} characters`)
                .custom((value) => {
                    // Check for null bytes and other dangerous characters
                    if (value.includes('\x00')) {
                        throw new Error('Code contains invalid characters');
                    }
                    return true;
                }),

            body('input')
                .optional()
                .isLength({ max: MAX_INPUT_LENGTH })
                .withMessage(`Input must not exceed ${MAX_INPUT_LENGTH} characters`)
                .custom((value) => {
                    if (value && value.includes('\x00')) {
                        throw new Error('Input contains invalid characters');
                    }
                    return true;
                }),

            body('timeout')
                .optional()
                .isInt({ min: 1000, max: 60000 })
                .withMessage('Timeout must be between 1000ms and 60000ms'),

            this.handleValidationErrors
        ];
    }

    // User registration validation
    static validateUserRegistration() {
        return [
            body('username')
                .isLength({ min: 3, max: 30 })
                .withMessage('Username must be between 3 and 30 characters')
                .matches(/^[a-zA-Z0-9_]+$/)
                .withMessage('Username can only contain letters, numbers, and underscores')
                .custom(async (value) => {
                    const User = require('../../models/User');
                    const existingUser = await User.findOne({ username: value });
                    if (existingUser) {
                        throw new Error('Username already exists');
                    }
                    return true;
                }),

            body('email')
                .isEmail()
                .withMessage('Please provide a valid email')
                .normalizeEmail()
                .custom(async (value) => {
                    const User = require('../../models/User');
                    const existingUser = await User.findOne({ email: value });
                    if (existingUser) {
                        throw new Error('Email already registered');
                    }
                    return true;
                }),

            body('password')
                .isLength({ min: 6 })
                .withMessage('Password must be at least 6 characters long')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),

            this.handleValidationErrors
        ];
    }

    // User login validation
    static validateUserLogin() {
        return [
            body('email')
                .isEmail()
                .withMessage('Please provide a valid email')
                .normalizeEmail(),

            body('password')
                .notEmpty()
                .withMessage('Password is required'),

            this.handleValidationErrors
        ];
    }

    // Execution ID validation
    static validateExecutionId() {
        return [
            param('executionId')
                .notEmpty()
                .withMessage('Execution ID is required')
                .isLength({ min: 10, max: 100 })
                .withMessage('Invalid execution ID format'),

            this.handleValidationErrors
        ];
    }

    // Pagination validation
    static validatePagination() {
        return [
            query('page')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Page must be a positive integer'),

            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 })
                .withMessage('Limit must be between 1 and 100'),

            query('sortBy')
                .optional()
                .isIn(['createdAt', 'executionTime', 'language', 'status'])
                .withMessage('Invalid sort field'),

            query('sortOrder')
                .optional()
                .isIn(['asc', 'desc'])
                .withMessage('Sort order must be asc or desc'),

            this.handleValidationErrors
        ];
    }

    // Language filter validation
    static validateLanguageFilter() {
        return [
            query('language')
                .optional()
                .isIn(Object.values(SUPPORTED_LANGUAGES))
                .withMessage(`Language must be one of: ${Object.values(SUPPORTED_LANGUAGES).join(', ')}`),

            this.handleValidationErrors
        ];
    }

    // Time range validation
    static validateTimeRange() {
        return [
            query('timeRange')
                .optional()
                .isIn(['hour', 'day', 'week', 'month'])
                .withMessage('Time range must be one of: hour, day, week, month'),

            this.handleValidationErrors
        ];
    }

    // File upload validation
    static validateFileUpload() {
        return [
            body('fileName')
                .optional()
                .isLength({ min: 1, max: 255 })
                .withMessage('File name must be between 1 and 255 characters')
                .matches(/^[a-zA-Z0-9._-]+$/)
                .withMessage('File name contains invalid characters'),

            this.handleValidationErrors
        ];
    }

    // User preferences validation
    static validateUserPreferences() {
        return [
            body('theme')
                .optional()
                .isIn(['light', 'dark'])
                .withMessage('Theme must be light or dark'),

            body('defaultLanguage')
                .optional()
                .isIn(Object.values(SUPPORTED_LANGUAGES))
                .withMessage(`Default language must be one of: ${Object.values(SUPPORTED_LANGUAGES).join(', ')}`),

            body('fontSize')
                .optional()
                .isInt({ min: 10, max: 24 })
                .withMessage('Font size must be between 10 and 24'),

            this.handleValidationErrors
        ];
    }

    // Custom sanitization middleware
    static sanitizeInput(req, res, next) {
        try {
            // Sanitize string inputs
            const sanitizeString = (str) => {
                if (typeof str !== 'string') return str;

                // Remove null bytes
                str = str.replace(/\x00/g, '');

                // Normalize unicode
                str = str.normalize('NFC');

                // Trim whitespace
                str = str.trim();

                return str;
            };

            // Recursively sanitize object
            const sanitizeObject = (obj) => {
                if (obj === null || typeof obj !== 'object') {
                    return typeof obj === 'string' ? sanitizeString(obj) : obj;
                }

                if (Array.isArray(obj)) {
                    return obj.map(sanitizeObject);
                }

                const sanitized = {};
                for (const [key, value] of Object.entries(obj)) {
                    sanitized[key] = sanitizeObject(value);
                }
                return sanitized;
            };

            // Sanitize request body
            if (req.body) {
                req.body = sanitizeObject(req.body);
            }

            // Sanitize query parameters
            if (req.query) {
                req.query = sanitizeObject(req.query);
            }

            next();

        } catch (error) {
            logger.error('Input sanitization failed', {
                error: error.message,
                ip: req.ip
            });

            return res.status(400).json({
                success: false,
                message: 'Invalid input format'
            });
        }
    }

    // Security headers validation
    static validateSecurityHeaders(req, res, next) {
        const requiredHeaders = ['user-agent'];
        const missingHeaders = [];

        for (const header of requiredHeaders) {
            if (!req.get(header)) {
                missingHeaders.push(header);
            }
        }

        if (missingHeaders.length > 0) {
            logger.warn('Missing security headers', {
                missingHeaders,
                ip: req.ip,
                endpoint: req.originalUrl
            });

            return res.status(400).json({
                success: false,
                message: 'Missing required headers',
                missingHeaders
            });
        }

        next();
    }

    // Content type validation for POST requests
    static validateContentType(req, res, next) {
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            const contentType = req.get('Content-Type');

            if (!contentType || !contentType.includes('application/json')) {
                return res.status(400).json({
                    success: false,
                    message: 'Content-Type must be application/json'
                });
            }
        }

        next();
    }
}

module.exports = ValidationMiddleware;