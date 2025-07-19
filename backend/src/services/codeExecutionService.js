// src/services/codeExecutionService.js
const dockerService = require('./dockerService');
const securityService = require('./securityService');
const CodeExecution = require('../../models/CodeExecution');
const Session = require('../../models/Session');
const User = require('../../models/User');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const { SUPPORTED_LANGUAGES, EXECUTION_STATUS } = require('../utils/constants');

class CodeExecutionService {
    async executeCode(requestData, sessionInfo, userInfo = null) {
        const executionId = Helpers.generateExecutionId();
        const startTime = Date.now();

        try {
            // Extract and validate request data
            const { language, code, input = '' } = requestData;

            // Validate language
            if (!Helpers.validateLanguage(language)) {
                throw new Error(`Unsupported language: ${language}`);
            }

            // Security validation
            const codeValidation = securityService.validateCode(code, language);
            if (!codeValidation.isValid) {
                logger.warn('Code security validation failed', {
                    executionId,
                    language,
                    errors: codeValidation.errors,
                    ipAddress: sessionInfo.ipAddress
                });

                return this.createErrorResponse(
                    executionId,
                    EXECUTION_STATUS.ERROR,
                    'Code validation failed: ' + codeValidation.errors.join(', '),
                    startTime
                );
            }

            // Input validation
            const inputValidation = securityService.validateInput(input);
            if (!inputValidation.isValid) {
                return this.createErrorResponse(
                    executionId,
                    EXECUTION_STATUS.ERROR,
                    'Input validation failed: ' + inputValidation.errors.join(', '),
                    startTime
                );
            }

            // Check user limits
            if (userInfo && userInfo.hasExceededDailyLimit()) {
                return this.createErrorResponse(
                    executionId,
                    EXECUTION_STATUS.ERROR,
                    'Daily execution limit exceeded',
                    startTime
                );
            }

            // Sanitize code and input
            const sanitizedCode = securityService.sanitizeCode(code);
            const sanitizedInput = securityService.sanitizeInput(input);

            logger.info('Starting code execution', {
                executionId,
                language,
                codeLength: sanitizedCode.length,
                inputLength: sanitizedInput.length,
                userId: userInfo?._id,
                sessionId: sessionInfo.sessionId
            });

            // Execute code in Docker container
            const executionResult = await dockerService.executeCode(
                language,
                sanitizedCode,
                sanitizedInput,
                executionId
            );

            const endTime = Date.now();

            // Create execution record
            const executionRecord = await this.createExecutionRecord({
                executionId,
                language,
                code: sanitizedCode,
                input: sanitizedInput,
                result: executionResult,
                sessionInfo,
                userInfo,
                startTime,
                endTime
            });

            // Update user and session statistics
            await this.updateStatistics(userInfo, sessionInfo, executionId, language);

            // Generate security report
            const securityReport = securityService.generateSecurityReport(
                sanitizedCode,
                language,
                sessionInfo.ipAddress
            );

            logger.info('Code execution completed', {
                executionId,
                status: executionResult.status,
                executionTime: executionResult.executionTime,
                memoryUsage: executionResult.memoryUsage
            });

            return {
                success: true,
                executionId,
                language,
                status: executionResult.status,
                output: executionResult.output,
                error: executionResult.error,
                executionTime: executionResult.executionTime,
                memoryUsage: executionResult.memoryUsage,
                exitCode: executionResult.exitCode,
                timestamp: new Date().toISOString(),
                securityReport: securityReport.isSecure ? null : securityReport
            };

        } catch (error) {
            logger.error('Code execution service error', {
                executionId,
                error: error.message,
                stack: error.stack
            });

            return this.createErrorResponse(
                executionId,
                EXECUTION_STATUS.ERROR,
                error.message,
                startTime
            );
        }
    }

    async createExecutionRecord(data) {
        try {
            const {
                executionId,
                language,
                code,
                input,
                result,
                sessionInfo,
                userInfo,
                startTime,
                endTime
            } = data;

            const executionRecord = new CodeExecution({
                executionId,
                userId: userInfo?._id,
                language,
                code,
                input,
                output: result.output,
                error: result.error,
                status: result.status,
                executionTime: result.executionTime,
                memoryUsage: result.memoryUsage,
                containerInfo: result.containerInfo,
                exitCode: result.exitCode,
                metadata: {
                    ipAddress: sessionInfo.ipAddress,
                    userAgent: sessionInfo.userAgent,
                    sessionId: sessionInfo.sessionId,
                    isAnonymous: !userInfo
                }
            });

            await executionRecord.save();
            return executionRecord;

        } catch (error) {
            logger.error('Failed to create execution record', {
                executionId: data.executionId,
                error: error.message
            });
            throw error;
        }
    }

    async updateStatistics(userInfo, sessionInfo, executionId, language) {
        try {
            // Update user statistics
            if (userInfo) {
                await userInfo.updateExecutionCount();
            }

            // Update session statistics
            if (sessionInfo) {
                await sessionInfo.incrementExecutionCount();
                await sessionInfo.addRecentExecution(executionId, language);
            }

        } catch (error) {
            logger.error('Failed to update statistics', {
                executionId,
                error: error.message
            });
            // Don't throw error as this is not critical for execution
        }
    }

    createErrorResponse(executionId, status, errorMessage, startTime) {
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        return {
            success: false,
            executionId,
            status,
            output: '',
            error: errorMessage,
            executionTime,
            memoryUsage: Helpers.getMemoryUsage(),
            exitCode: -1,
            timestamp: new Date().toISOString()
        };
    }

    async getExecutionHistory(userId, options = {}) {
        try {
            const {
                page = 1,
                limit = 10,
                language = null,
                status = null,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = options;

            const query = { userId };

            if (language) {
                query.language = language;
            }

            if (status) {
                query.status = status;
            }

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const executions = await CodeExecution.find(query)
                .sort(sort)
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .select('executionId language status executionTime createdAt output error')
                .lean();

            const total = await CodeExecution.countDocuments(query);

            return {
                executions,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to get execution history', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    async getExecutionById(executionId, userId = null) {
        try {
            const query = { executionId };

            // If user is provided, ensure they can only access their own executions
            if (userId) {
                query.userId = userId;
            }

            const execution = await CodeExecution.findOne(query)
                .populate('userId', 'username')
                .lean();

            if (!execution) {
                throw new Error('Execution not found');
            }

            return execution;

        } catch (error) {
            logger.error('Failed to get execution by ID', {
                executionId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    async deleteExecution(executionId, userId) {
        try {
            const result = await CodeExecution.deleteOne({
                executionId,
                userId
            });

            if (result.deletedCount === 0) {
                throw new Error('Execution not found or unauthorized');
            }

            logger.info('Execution deleted', { executionId, userId });
            return true;

        } catch (error) {
            logger.error('Failed to delete execution', {
                executionId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    async getExecutionStatistics(userId = null, timeRange = 'day') {
        try {
            let stats;

            if (userId) {
                // Get user-specific statistics
                stats = await this.getUserExecutionStats(userId, timeRange);
            } else {
                // Get global statistics
                stats = await CodeExecution.getExecutionStats(timeRange);
            }

            return stats;

        } catch (error) {
            logger.error('Failed to get execution statistics', {
                userId,
                timeRange,
                error: error.message
            });
            throw error;
        }
    }

    async getUserExecutionStats(userId, timeRange) {
        const now = new Date();
        let startDate;

        switch (timeRange) {
            case 'hour':
                startDate = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case 'day':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        const stats = await CodeExecution.aggregate([
            {
                $match: {
                    userId: userId,
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalExecutions: { $sum: 1 },
                    successfulExecutions: {
                        $sum: {
                            $cond: [{ $eq: ['$status', EXECUTION_STATUS.SUCCESS] }, 1, 0]
                        }
                    },
                    errorExecutions: {
                        $sum: {
                            $cond: [{ $eq: ['$status', EXECUTION_STATUS.ERROR] }, 1, 0]
                        }
                    },
                    averageExecutionTime: { $avg: '$executionTime' },
                    languageBreakdown: {
                        $push: '$language'
                    }
                }
            }
        ]);

        return stats[0] || {
            totalExecutions: 0,
            successfulExecutions: 0,
            errorExecutions: 0,
            averageExecutionTime: 0,
            languageBreakdown: []
        };
    }

    async killExecution(executionId, userId = null) {
        try {
            // Verify execution belongs to user (if user is provided)
            if (userId) {
                const execution = await CodeExecution.findOne({
                    executionId,
                    userId
                });

                if (!execution) {
                    throw new Error('Execution not found or unauthorized');
                }
            }

            // Kill the Docker container
            const killed = await dockerService.killContainer(executionId);

            if (killed) {
                logger.info('Execution killed', { executionId, userId });
                return { success: true, message: 'Execution terminated' };
            } else {
                return { success: false, message: 'Execution not found or already completed' };
            }

        } catch (error) {
            logger.error('Failed to kill execution', {
                executionId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    async cleanupOldExecutions(daysOld = 90) {
        try {
            const result = await CodeExecution.cleanupOldExecutions(daysOld);
            logger.info('Old executions cleaned up', {
                deletedCount: result.deletedCount,
                daysOld
            });
            return result;

        } catch (error) {
            logger.error('Failed to cleanup old executions', {
                daysOld,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new CodeExecutionService();