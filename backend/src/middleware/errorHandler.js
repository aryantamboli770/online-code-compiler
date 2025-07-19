const logger = require('../utils/logger');

class ErrorHandler {
    static handleError(err, req, res, next) {
        let error = { ...err };
        error.message = err.message;

        // Log error
        logger.error('Error occurred', {
            error: error.message,
            stack: error.stack,
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id
        });

        // Mongoose bad ObjectId
        if (err.name === 'CastError') {
            const message = 'Resource not found';
            error = { message, statusCode: 404 };
        }

        // Mongoose duplicate key
        if (err.code === 11000) {
            const message = 'Duplicate field value entered';
            error = { message, statusCode: 400 };
        }

        // Mongoose validation error
        if (err.name === 'ValidationError') {
            const message = Object.values(err.errors).map(val => val.message).join(', ');
            error = { message, statusCode: 400 };
        }

        // JWT errors
        if (err.name === 'JsonWebTokenError') {
            const message = 'Invalid token';
            error = { message, statusCode: 401 };
        }

        if (err.name === 'TokenExpiredError') {
            const message = 'Token expired';
            error = { message, statusCode: 401 };
        }

        // Docker errors
        if (err.message && err.message.includes('Docker')) {
            const message = 'Code execution service temporarily unavailable';
            error = { message, statusCode: 503 };
        }

        // Rate limit errors
        if (err.message && err.message.includes('rate limit')) {
            const message = 'Too many requests, please try again later';
            error = { message, statusCode: 429 };
        }

        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Server Error',
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    }

    static notFound(req, res, next) {
        const error = new Error(`Not found - ${req.originalUrl}`);
        res.status(404);
        next(error);
    }

    static asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }
}

module.exports = ErrorHandler;