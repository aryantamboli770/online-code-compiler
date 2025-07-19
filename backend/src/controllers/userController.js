// src/controllers/userController.js
const User = require('../../models/User');
const CodeExecution = require('../../models/CodeExecution');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

class UserController {
    // Get user profile
    static async getProfile(req, res) {
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
            logger.error('Get user profile error', {
                error: error.message,
                userId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve user profile',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Update user profile
    static async updateProfile(req, res) {
        try {
            const user = req.user;
            const { username, email } = req.body;

            // Check if username is taken (if changed)
            if (username && username !== user.username) {
                const existingUser = await User.findOne({ username });
                if (existingUser) {
                    return res.status(400).json({
                        success: false,
                        message: 'Username already exists'
                    });
                }
                user.username = username;
            }

            // Check if email is taken (if changed)
            if (email && email !== user.email) {
                const existingUser = await User.findOne({ email });
                if (existingUser) {
                    return res.status(400).json({
                        success: false,
                        message: 'Email already exists'
                    });
                }
                user.email = email;
            }

            await user.save();

            logger.info('User profile updated', {
                userId: user._id,
                changes: { username, email }
            });

            res.json({
                success: true,
                message: 'Profile updated successfully',
                data: {
                    user: {
                        id: user._id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        updatedAt: user.updatedAt
                    }
                }
            });

        } catch (error) {
            logger.error('Update user profile error', {
                error: error.message,
                userId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to update profile',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Update user preferences
    static async updatePreferences(req, res) {
        try {
            const user = req.user;
            const { theme, defaultLanguage, fontSize } = req.body;

            // Update preferences
            if (theme) user.preferences.theme = theme;
            if (defaultLanguage) user.preferences.defaultLanguage = defaultLanguage;
            if (fontSize) user.preferences.fontSize = fontSize;

            await user.save();

            logger.info('User preferences updated', {
                userId: user._id,
                preferences: { theme, defaultLanguage, fontSize }
            });

            res.json({
                success: true,
                message: 'Preferences updated successfully',
                data: {
                    preferences: user.preferences
                }
            });

        } catch (error) {
            logger.error('Update user preferences error', {
                error: error.message,
                userId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to update preferences',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Change password
    static async changePassword(req, res) {
        try {
            const user = await User.findById(req.user._id).select('+password');
            const { currentPassword, newPassword } = req.body;

            // Verify current password
            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Update password
            user.password = newPassword;
            await user.save();

            // Clear all refresh tokens to force re-login
            user.refreshTokens = [];
            await user.save();

            logger.info('User password changed', {
                userId: user._id,
                username: user.username
            });

            res.json({
                success: true,
                message: 'Password changed successfully. Please login again.'
            });

        } catch (error) {
            logger.error('Change password error', {
                error: error.message,
                userId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to change password',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Delete user account
    static async deleteAccount(req, res) {
        try {
            const user = req.user;
            const { password, confirmDeletion } = req.body;

            // Verify password
            const userWithPassword = await User.findById(user._id).select('+password');
            const isMatch = await userWithPassword.comparePassword(password);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Password is incorrect'
                });
            }

            // Confirm deletion
            if (confirmDeletion !== 'DELETE') {
                return res.status(400).json({
                    success: false,
                    message: 'Please confirm deletion by typing "DELETE"'
                });
            }

            // Delete user's executions
            await CodeExecution.deleteMany({ userId: user._id });

            // Delete user account
            await User.findByIdAndDelete(user._id);

            logger.info('User account deleted', {
                userId: user._id,
                username: user.username,
                email: user.email
            });

            res.json({
                success: true,
                message: 'Account deleted successfully'
            });

        } catch (error) {
            logger.error('Delete account error', {
                error: error.message,
                userId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to delete account',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get user statistics
    static async getUserStatistics(req, res) {
        try {
            const userId = req.user._id;
            const timeRange = req.query.timeRange || 'day';

            // Get execution statistics
            const stats = await CodeExecution.getUserExecutionStats(userId, timeRange);

            // Get additional user info
            const user = req.user;
            const userStats = {
                totalExecutions: user.executionCount,
                dailyExecutions: user.dailyExecutionCount,
                lastExecution: user.lastExecutionDate,
                memberSince: user.createdAt,
                lastLogin: user.lastLogin
            };

            logger.info('User statistics retrieved', {
                userId,
                timeRange,
                totalExecutions: stats.totalExecutions
            });

            res.json({
                success: true,
                data: {
                    timeRange,
                    executionStats: stats,
                    userStats
                }
            });

        } catch (error) {
            logger.error('Get user statistics error', {
                error: error.message,
                userId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve user statistics',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }
}

module.exports = UserController;