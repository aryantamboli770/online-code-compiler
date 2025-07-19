// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Session = require('../../models/Session');
const logger = require('../utils/logger');

class AuthMiddleware {
    // Middleware to verify JWT token
    static async verifyToken(req, res, next) {
        try {
            const token = req.header('Authorization')?.replace('Bearer ', '');

            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Access denied. No token provided.'
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId).select('-password');

            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token. User not found or inactive.'
                });
            }

            req.user = user;
            next();

        } catch (error) {
            logger.error('Token verification failed', {
                error: error.message,
                token: req.header('Authorization')?.substring(0, 20) + '...'
            });

            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired. Please login again.'
                });
            }

            return res.status(401).json({
                success: false,
                message: 'Invalid token.'
            });
        }
    }

    // Optional authentication - doesn't fail if no token
    static async optionalAuth(req, res, next) {
        try {
            const token = req.header('Authorization')?.replace('Bearer ', '');

            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.userId).select('-password');

                if (user && user.isActive) {
                    req.user = user;
                }
            }

            next();

        } catch (error) {
            // Continue without authentication for optional auth
            logger.warn('Optional auth failed', { error: error.message });
            next();
        }
    }

    // Middleware to check if user is admin
    static requireAdmin(req, res, next) {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }
        next();
    }

    // Middleware to manage sessions
    static async manageSession(req, res, next) {
        try {
            const sessionId = req.header('X-Session-ID') || req.cookies?.sessionId;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('User-Agent') || 'Unknown';

            let session;

            if (sessionId) {
                session = await Session.findActiveSession(sessionId);
            }

            if (!session) {
                // Create new session
                session = await Session.createSession({
                    ipAddress,
                    userAgent,
                    userId: req.user?._id
                });

                // Set session cookie
                res.cookie('sessionId', session.sessionId, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                });
            } else {
                // Update existing session
                await session.updateActivity();

                // Associate user if authenticated
                if (req.user && session.isAnonymous) {
                    await session.associateUser(req.user._id);
                }
            }

            req.session = session;
            next();

        } catch (error) {
            logger.error('Session management failed', {
                error: error.message,
                ip: req.ip
            });

            // Continue without session for non-critical operations
            next();
        }
    }

    // Middleware to check execution limits
    static async checkExecutionLimits(req, res, next) {
        try {
            if (req.user) {
                // Check user limits
                if (req.user.hasExceededDailyLimit()) {
                    return res.status(429).json({
                        success: false,
                        message: 'Daily execution limit exceeded. Please try again tomorrow.',
                        limit: req.user.role === 'admin' ? 1000 : 100,
                        current: req.user.dailyExecutionCount
                    });
                }
            } else if (req.session) {
                // Check session limits for anonymous users
                const sessionLimit = 20; // Anonymous users get 20 executions per session
                if (req.session.executionCount >= sessionLimit) {
                    return res.status(429).json({
                        success: false,
                        message: 'Session execution limit exceeded. Please register for more executions.',
                        limit: sessionLimit,
                        current: req.session.executionCount
                    });
                }
            }

            next();

        } catch (error) {
            logger.error('Execution limit check failed', {
                error: error.message,
                userId: req.user?._id,
                sessionId: req.session?.sessionId
            });
            next();
        }
    }

    // Middleware to extract user info for logging
    static extractUserInfo(req, res, next) {
        req.userInfo = {
            userId: req.user?._id,
            username: req.user?.username,
            role: req.user?.role,
            sessionId: req.session?.sessionId,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        };

        next();
    }
}

module.exports = AuthMiddleware;