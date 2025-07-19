// src/controllers/adminController.js
const User = require('../../models/User');
const CodeExecution = require('../../models/CodeExecution');
const Session = require('../../models/Session');
const dockerService = require('../services/dockerService');
const logger = require('../utils/logger');

class AdminController {
    // Get global statistics
    static async getGlobalStatistics(req, res) {
        try {
            const timeRange = req.query.timeRange || 'day';

            const [executionStats, sessionStats, userCount, totalExecutions] = await Promise.all([
                CodeExecution.getExecutionStats(timeRange),
                Session.getSessionStats(timeRange),
                User.countDocuments(),
                CodeExecution.countDocuments()
            ]);

            const stats = {
                timeRange,
                executions: executionStats,
                sessions: sessionStats,
                users: {
                    total: userCount,
                    active: await User.countDocuments({ isActive: true }),
                    admins: await User.countDocuments({ role: 'admin' })
                },
                system: {
                    totalExecutions,
                    activeContainers: dockerService.getActiveContainerCount(),
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                }
            };

            logger.info('Global statistics retrieved', {
                adminUserId: req.user._id,
                timeRange,
                totalExecutions: stats.executions.totalExecutions
            });

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('Get global statistics error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve global statistics',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get all users
    static async getAllUsers(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const sortBy = req.query.sortBy || 'createdAt';
            const sortOrder = req.query.sortOrder || 'desc';

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const users = await User.find()
                .sort(sort)
                .limit(limit)
                .skip((page - 1) * limit)
                .select('-password -refreshTokens')
                .lean();

            const total = await User.countDocuments();

            logger.info('All users retrieved', {
                adminUserId: req.user._id,
                page,
                limit,
                total
            });

            res.json({
                success: true,
                data: users,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            logger.error('Get all users error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve users',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get user by ID
    static async getUserById(req, res) {
        try {
            const { userId } = req.params;

            const user = await User.findById(userId)
                .select('-password -refreshTokens')
                .lean();

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Get user's execution count
            const executionCount = await CodeExecution.countDocuments({ userId });

            logger.info('User retrieved by admin', {
                adminUserId: req.user._id,
                targetUserId: userId
            });

            res.json({
                success: true,
                data: {
                    ...user,
                    totalExecutions: executionCount
                }
            });

        } catch (error) {
            logger.error('Get user by ID error', {
                error: error.message,
                adminUserId: req.user._id,
                targetUserId: req.params.userId
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve user',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Update user (admin can modify any user)
    static async updateUser(req, res) {
        try {
            const { userId } = req.params;
            const updates = req.body;

            // Prevent admin from modifying their own role
            if (userId === req.user._id.toString() && updates.role) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot modify your own role'
                });
            }

            const user = await User.findByIdAndUpdate(
                userId,
                updates,
                { new: true, runValidators: true }
            ).select('-password -refreshTokens');

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            logger.info('User updated by admin', {
                adminUserId: req.user._id,
                targetUserId: userId,
                updates
            });

            res.json({
                success: true,
                message: 'User updated successfully',
                data: user
            });

        } catch (error) {
            logger.error('Update user error', {
                error: error.message,
                adminUserId: req.user._id,
                targetUserId: req.params.userId
            });

            res.status(500).json({
                success: false,
                message: 'Failed to update user',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Delete user
    static async deleteUser(req, res) {
        try {
            const { userId } = req.params;

            // Prevent admin from deleting themselves
            if (userId === req.user._id.toString()) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete your own account'
                });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Delete user's executions
            await CodeExecution.deleteMany({ userId });

            // Delete user
            await User.findByIdAndDelete(userId);

            logger.info('User deleted by admin', {
                adminUserId: req.user._id,
                targetUserId: userId,
                deletedUsername: user.username
            });

            res.json({
                success: true,
                message: 'User deleted successfully'
            });

        } catch (error) {
            logger.error('Delete user error', {
                error: error.message,
                adminUserId: req.user._id,
                targetUserId: req.params.userId
            });

            res.status(500).json({
                success: false,
                message: 'Failed to delete user',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get all executions
    static async getAllExecutions(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const language = req.query.language;
            const status = req.query.status;
            const sortBy = req.query.sortBy || 'createdAt';
            const sortOrder = req.query.sortOrder || 'desc';

            const query = {};
            if (language) query.language = language;
            if (status) query.status = status;

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const executions = await CodeExecution.find(query)
                .sort(sort)
                .limit(limit)
                .skip((page - 1) * limit)
                .populate('userId', 'username email')
                .select('executionId language status executionTime createdAt userId output error')
                .lean();

            const total = await CodeExecution.countDocuments(query);

            logger.info('All executions retrieved by admin', {
                adminUserId: req.user._id,
                page,
                limit,
                total,
                filters: { language, status }
            });

            res.json({
                success: true,
                data: executions,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            logger.error('Get all executions error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve executions',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get execution by ID
    static async getExecutionById(req, res) {
        try {
            const { executionId } = req.params;

            const execution = await CodeExecution.findOne({ executionId })
                .populate('userId', 'username email')
                .lean();

            if (!execution) {
                return res.status(404).json({
                    success: false,
                    message: 'Execution not found'
                });
            }

            logger.info('Execution retrieved by admin', {
                adminUserId: req.user._id,
                executionId
            });

            res.json({
                success: true,
                data: execution
            });

        } catch (error) {
            logger.error('Get execution by ID error', {
                error: error.message,
                adminUserId: req.user._id,
                executionId: req.params.executionId
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve execution',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Delete execution
    static async deleteExecution(req, res) {
        try {
            const { executionId } = req.params;

            const result = await CodeExecution.deleteOne({ executionId });

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Execution not found'
                });
            }

            logger.info('Execution deleted by admin', {
                adminUserId: req.user._id,
                executionId
            });

            res.json({
                success: true,
                message: 'Execution deleted successfully'
            });

        } catch (error) {
            logger.error('Delete execution error', {
                error: error.message,
                adminUserId: req.user._id,
                executionId: req.params.executionId
            });

            res.status(500).json({
                success: false,
                message: 'Failed to delete execution',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Cleanup old executions
    static async cleanupOldExecutions(req, res) {
        try {
            const daysOld = parseInt(req.query.daysOld) || 90;
            const result = await CodeExecution.cleanupOldExecutions(daysOld);

            logger.info('Old executions cleanup by admin', {
                adminUserId: req.user._id,
                daysOld,
                deletedCount: result.deletedCount
            });

            res.json({
                success: true,
                message: `Cleaned up ${result.deletedCount} old executions`,
                data: {
                    deletedCount: result.deletedCount,
                    daysOld
                }
            });

        } catch (error) {
            logger.error('Cleanup old executions error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to cleanup old executions',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Cleanup expired sessions
    static async cleanupExpiredSessions(req, res) {
        try {
            const result = await Session.cleanupExpiredSessions();

            logger.info('Expired sessions cleanup by admin', {
                adminUserId: req.user._id,
                deletedCount: result.deletedCount
            });

            res.json({
                success: true,
                message: `Cleaned up ${result.deletedCount} expired sessions`,
                data: {
                    deletedCount: result.deletedCount
                }
            });

        } catch (error) {
            logger.error('Cleanup expired sessions error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to cleanup expired sessions',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Restart system (placeholder - would need proper implementation)
    static async restartSystem(req, res) {
        try {
            logger.warn('System restart requested by admin', {
                adminUserId: req.user._id,
                ip: req.ip
            });

            // In a real implementation, you would:
            // 1. Gracefully close all connections
            // 2. Stop all running containers
            // 3. Save any pending data
            // 4. Restart the application

            res.json({
                success: true,
                message: 'System restart initiated (placeholder implementation)'
            });

        } catch (error) {
            logger.error('System restart error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to restart system',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Cleanup Docker containers
    static async cleanupDockerContainers(req, res) {
        try {
            await dockerService.cleanupAllContainers();

            logger.info('Docker containers cleanup by admin', {
                adminUserId: req.user._id
            });

            res.json({
                success: true,
                message: 'Docker containers cleaned up successfully'
            });

        } catch (error) {
            logger.error('Docker cleanup error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to cleanup Docker containers',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }
}

module.exports = AdminController;