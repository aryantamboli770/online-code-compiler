// src/controllers/authController.js
const User = require('../../models/User');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

class AuthController {
    // User registration
    static async register(req, res) {
        try {
            const { username, email, password } = req.body;

            // Create new user
            const user = new User({
                username,
                email,
                password
            });

            await user.save();

            // Generate tokens
            const accessToken = user.generateAuthToken();
            const refreshToken = user.generateRefreshToken();
            await user.save(); // Save refresh token

            logger.info('User registered successfully', {
                userId: user._id,
                username: user.username,
                email: user.email,
                ip: req.ip
            });

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    user: {
                        id: user._id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        createdAt: user.createdAt
                    },
                    tokens: {
                        accessToken,
                        refreshToken
                    }
                }
            });

        } catch (error) {
            logger.error('User registration error', {
                error: error.message,
                stack: error.stack,
                ip: req.ip
            });

            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern)[0];
                return res.status(400).json({
                    success: false,
                    message: `${field} already exists`,
                    field
                });
            }

            res.status(500).json({
                success: false,
                message: 'Registration failed',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // User login
    static async login(req, res) {
        try {
            const { email, password } = req.body;

            // Find user and validate credentials
            const user = await User.findByCredentials(email, password);

            // Update last login
            user.lastLogin = new Date();

            // Generate tokens
            const accessToken = user.generateAuthToken();
            const refreshToken = user.generateRefreshToken();

            await user.save();

            logger.info('User logged in successfully', {
                userId: user._id,
                username: user.username,
                email: user.email,
                ip: req.ip
            });

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: {
                        id: user._id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        lastLogin: user.lastLogin,
                        preferences: user.preferences
                    },
                    tokens: {
                        accessToken,
                        refreshToken
                    }
                }
            });

        } catch (error) {
            logger.error('User login error', {
                error: error.message,
                email: req.body.email,
                ip: req.ip
            });

            res.status(401).json({
                success: false,
                message: error.message || 'Login failed'
            });
        }
    }

    // User logout
    static async logout(req, res) {
        try {
            const user = req.user;
            const token = req.header('Authorization')?.replace('Bearer ', '');

            // Remove refresh tokens (optional: could remove specific token)
            user.refreshTokens = [];
            await user.save();

            logger.info('User logged out successfully', {
                userId: user._id,
                username: user.username,
                ip: req.ip
            });

            res.json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            logger.error('User logout error', {
                error: error.message,
                userId: req.user?._id,
                ip: req.ip
            });

            res.status(500).json({
                success: false,
                message: 'Logout failed',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Refresh access token
    static async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    success: false,
                    message: 'Refresh token is required'
                });
            }

            // Verify refresh token
            const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET + 'refresh');
            const user = await User.findById(decoded.userId);

            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid refresh token'
                });
            }

            // Check if refresh token exists in user's tokens
            const tokenExists = user.refreshTokens.some(tokenObj => tokenObj.token === refreshToken);
            if (!tokenExists) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid refresh token'
                });
            }

            // Generate new tokens
            const newAccessToken = user.generateAuthToken();
            const newRefreshToken = user.generateRefreshToken();

            // Remove old refresh token and save new one
            user.refreshTokens = user.refreshTokens.filter(tokenObj => tokenObj.token !== refreshToken);
            await user.save();

            logger.info('Token refreshed successfully', {
                userId: user._id,
                username: user.username,
                ip: req.ip
            });

            res.json({
                success: true,
                message: 'Token refreshed successfully',
                data: {
                    tokens: {
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken
                    }
                }
            });

        } catch (error) {
            logger.error('Token refresh error', {
                error: error.message,
                ip: req.ip
            });

            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token expired. Please login again.'
                });
            }

            res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }
    }

    // Get current user info
    static async getCurrentUser(req, res) {
        try {
            const user = req.user;

            res.json({
                success: true,
                data: {
                    user: {
                        id: user._id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        isActive: user.isActive,
                        lastLogin: user.lastLogin,
                        executionCount: user.executionCount,
                        dailyExecutionCount: user.dailyExecutionCount,
                        preferences: user.preferences,
                        createdAt: user.createdAt,
                        updatedAt: user.updatedAt
                    }
                }
            });

        } catch (error) {
            logger.error('Get current user error', {
                error: error.message,
                userId: req.user?._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve user information',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }
}

module.exports = AuthController;