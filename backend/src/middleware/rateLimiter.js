// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
const Session = require('../../models/Session');
const logger = require('../utils/logger');
const { RATE_LIMIT_CONFIG } = require('../utils/constants');

class RateLimiterMiddleware {
    // General API rate limiter
    static createGeneralLimiter() {
        return rateLimit({
            windowMs: RATE_LIMIT_CONFIG.windowMs,
            max: RATE_LIMIT_CONFIG.max,
            message: {
                success: false,
                message: RATE_LIMIT_CONFIG.message,
                retryAfter: Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000)
            },
            standardHeaders: RATE_LIMIT_CONFIG.standardHeaders,
            legacyHeaders: RATE_LIMIT_CONFIG.legacyHeaders,
            keyGenerator: (req) => {
                // Use user ID if authenticated, otherwise IP address
                return req.user?.id || req.ip;
            },
            skip: (req) => {
                // Skip rate limiting for admin users
                return req.user?.role === 'admin';
            },
            onLimitReached: (req, res, options) => {
                logger.warn('Rate limit exceeded', {
                    ip: req.ip,
                    userId: req.user?.id,
                    userAgent: req.get('User-Agent'),
                    endpoint: req.originalUrl
                });
            }
        });
    }

    // Strict rate limiter for code execution
    static createExecutionLimiter() {
        return rateLimit({
            windowMs: 60 * 1000, // 1 minute
            max: (req) => {
                // Different limits based on user type
                if (req.user?.role === 'admin') return 50;
                if (req.user) return 10; // Authenticated users
                return 5; // Anonymous users
            },
            message: {
                success: false,
                message: 'Too many code executions. Please wait before trying again.',
                retryAfter: 60
            },
            keyGenerator: (req) => {
                return req.user?.id || req.session?.sessionId || req.ip;
            },
            skip: (req) => {
                return req.user?.role === 'admin';
            },
            onLimitReached: (req, res, options) => {
                logger.warn('Execution rate limit exceeded', {
                    ip: req.ip,
                    userId: req.user?.id,
                    sessionId: req.session?.sessionId,
                    userAgent: req.get('User-Agent')
                });
            }
        });
    }

    // Authentication rate limiter
    static createAuthLimiter() {
        return rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 attempts per window
            message: {
                success: false,
                message: 'Too many authentication attempts. Please try again later.',
                retryAfter: 900
            },
            skipSuccessfulRequests: true,
            onLimitReached: (req, res, options) => {
                logger.warn('Authentication rate limit exceeded', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    endpoint: req.originalUrl
                });
            }
        });
    }

    // Custom session-based rate limiter
    static async sessionBasedLimiter(req, res, next) {
        try {
            if (!req.session) {
                return next();
            }

            const windowMs = 15 * 60 * 1000; // 15 minutes
            const maxRequests = req.user ? 200 : 50; // Higher limit for authenticated users

            const allowed = req.session.checkRateLimit(windowMs, maxRequests);

            if (!allowed) {
                req.session.securityFlags.rateLimitExceeded = true;
                await req.session.save();

                logger.warn('Session rate limit exceeded', {
                    sessionId: req.session.sessionId,
                    ip: req.ip,
                    userId: req.user?.id
                });

                return res.status(429).json({
                    success: false,
                    message: 'Rate limit exceeded for this session.',
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            }

            await req.session.incrementRequestCount();
            next();

        } catch (error) {
            logger.error('Session rate limiter error', {
                error: error.message,
                sessionId: req.session?.sessionId
            });
            next(); // Continue on error
        }
    }

    // IP-based suspicious activity detector
    static async suspiciousActivityDetector(req, res, next) {
        try {
            const ipAddress = req.ip;
            const userAgent = req.get('User-Agent');
            const endpoint = req.originalUrl;

            // Check for suspicious patterns
            const suspiciousPatterns = [
                /bot|crawler|spider/i.test(userAgent),
                req.method === 'POST' && !req.get('Content-Type'),
                req.headers['x-forwarded-for']?.split(',').length > 3, // Too many proxies
                !userAgent || userAgent.length < 10
            ];

            const suspiciousScore = suspiciousPatterns.filter(Boolean).length;

            if (suspiciousScore >= 2) {
                logger.warn('Suspicious activity detected', {
                    ip: ipAddress,
                    userAgent,
                    endpoint,
                    suspiciousScore,
                    patterns: suspiciousPatterns
                });

                // Flag session if available
                if (req.session) {
                    await req.session.flagSuspiciousActivity();
                }

                // Block if score is too high
                if (suspiciousScore >= 3) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied due to suspicious activity.'
                    });
                }
            }

            next();

        } catch (error) {
            logger.error('Suspicious activity detector error', {
                error: error.message,
                ip: req.ip
            });
            next(); // Continue on error
        }
    }

    // Dynamic rate limiter based on system load
    static createDynamicLimiter() {
        return (req, res, next) => {
            const systemLoad = process.cpuUsage();
            const memoryUsage = process.memoryUsage();

            // Calculate system stress level (0-1)
            const memoryStress = memoryUsage.heapUsed / memoryUsage.heapTotal;
            const stressLevel = Math.min(memoryStress, 1);

            // Adjust rate limits based on system stress
            const baseLimit = req.user?.role === 'admin' ? 100 : 50;
            const adjustedLimit = Math.max(Math.floor(baseLimit * (1 - stressLevel)), 5);

            // Create dynamic rate limiter
            const dynamicLimiter = rateLimit({
                windowMs: 60 * 1000,
                max: adjustedLimit,
                message: {
                    success: false,
                    message: `System under high load. Rate limit: ${adjustedLimit} requests per minute.`,
                    retryAfter: 60
                },
                keyGenerator: (req) => req.user?.id || req.ip
            });

            dynamicLimiter(req, res, next);
        };
    }
}

module.exports = RateLimiterMiddleware;