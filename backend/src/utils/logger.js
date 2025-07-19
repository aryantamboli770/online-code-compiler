const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Define transports
const transports = [
    // Console transport
    new winston.transports.Console({
        level: level(),
        format: format
    }),

    // File transport for errors
    new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }),

    // File transport for all logs
    new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'combined.log'),
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    })
];

// Create logger instance
const logger = winston.createLogger({
    level: level(),
    levels,
    format: fileFormat,
    transports,
    exitOnError: false
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Add request logging middleware
logger.requestLogger = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;

        if (res.statusCode >= 400) {
            logger.warn(message, {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        } else {
            logger.http(message, {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration,
                ip: req.ip
            });
        }
    });

    next();
};

// Add security logging
logger.security = (message, meta = {}) => {
    logger.warn(`[SECURITY] ${message}`, {
        ...meta,
        timestamp: new Date().toISOString(),
        type: 'security'
    });
};

// Add performance logging
logger.performance = (message, meta = {}) => {
    logger.info(`[PERFORMANCE] ${message}`, {
        ...meta,
        timestamp: new Date().toISOString(),
        type: 'performance'
    });
};

// Add audit logging
logger.audit = (message, meta = {}) => {
    logger.info(`[AUDIT] ${message}`, {
        ...meta,
        timestamp: new Date().toISOString(),
        type: 'audit'
    });
};

// Add execution logging
logger.execution = (message, meta = {}) => {
    logger.info(`[EXECUTION] ${message}`, {
        ...meta,
        timestamp: new Date().toISOString(),
        type: 'execution'
    });
};

// Handle uncaught exceptions
logger.exceptions.handle(
    new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
        format: fileFormat
    })
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason.stack || reason
    });
});

module.exports = logger;