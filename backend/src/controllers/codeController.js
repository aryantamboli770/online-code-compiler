// src/controllers/codeController.js
const codeExecutionService = require('../services/codeExecutionService');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

class CodeController {
    // Execute code
    static async executeCode(req, res) {
        const startTime = Date.now();

        try {
            const { language, code, input = '' } = req.body;
            const userInfo = req.user;
            const sessionInfo = req.session;

            logger.info('Code execution request received', {
                language,
                codeLength: code.length,
                inputLength: input.length,
                userId: userInfo?._id,
                sessionId: sessionInfo?.sessionId,
                ip: req.ip
            });

            // Execute code using the service
            const result = await codeExecutionService.executeCode(
                { language, code, input },
                sessionInfo,
                userInfo
            );

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            logger.info('Code execution completed', {
                executionId: result.executionId,
                success: result.success,
                status: result.status,
                executionTime: result.executionTime,
                totalTime,
                userId: userInfo?._id
            });

            // Set appropriate status code based on result
            const statusCode = result.success ? 200 : 400;

            res.status(statusCode).json({
                ...result,
                totalProcessingTime: totalTime
            });

        } catch (error) {
            const endTime = Date.now();
            const totalTime = endTime - startTime;

            logger.error('Code execution controller error', {
                error: error.message,
                stack: error.stack,
                totalTime,
                userId: req.user?._id,
                ip: req.ip
            });

            res.status(500).json({
                success: false,
                message: 'Internal server error during code execution',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
                totalProcessingTime: totalTime
            });
        }
    }

    // Get execution history
    static async getExecutionHistory(req, res) {
        try {
            const userId = req.user._id;
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 10,
                language: req.query.language,
                status: req.query.status,
                sortBy: req.query.sortBy || 'createdAt',
                sortOrder: req.query.sortOrder || 'desc'
            };

            const result = await codeExecutionService.getExecutionHistory(userId, options);

            logger.info('Execution history retrieved', {
                userId,
                page: options.page,
                limit: options.limit,
                total: result.pagination.total
            });

            res.json({
                success: true,
                data: result.executions,
                pagination: result.pagination
            });

        } catch (error) {
            logger.error('Get execution history error', {
                error: error.message,
                userId: req.user?._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve execution history',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get specific execution by ID
    static async getExecutionById(req, res) {
        try {
            const { executionId } = req.params;
            const userId = req.user?._id;

            const execution = await codeExecutionService.getExecutionById(executionId, userId);

            logger.info('Execution retrieved', {
                executionId,
                userId
            });

            res.json({
                success: true,
                data: execution
            });

        } catch (error) {
            logger.error('Get execution by ID error', {
                error: error.message,
                executionId: req.params.executionId,
                userId: req.user?._id
            });

            const statusCode = error.message.includes('not found') ? 404 : 500;

            res.status(statusCode).json({
                success: false,
                message: error.message,
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Delete execution
    static async deleteExecution(req, res) {
        try {
            const { executionId } = req.params;
            const userId = req.user._id;

            await codeExecutionService.deleteExecution(executionId, userId);

            logger.info('Execution deleted', {
                executionId,
                userId
            });

            res.json({
                success: true,
                message: 'Execution deleted successfully'
            });

        } catch (error) {
            logger.error('Delete execution error', {
                error: error.message,
                executionId: req.params.executionId,
                userId: req.user?._id
            });

            const statusCode = error.message.includes('not found') || error.message.includes('unauthorized') ? 404 : 500;

            res.status(statusCode).json({
                success: false,
                message: error.message,
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get execution statistics
    static async getExecutionStatistics(req, res) {
        try {
            const userId = req.user?._id;
            const timeRange = req.query.timeRange || 'day';

            const stats = await codeExecutionService.getExecutionStatistics(userId, timeRange);

            logger.info('Execution statistics retrieved', {
                userId,
                timeRange,
                totalExecutions: stats.totalExecutions
            });

            res.json({
                success: true,
                data: stats,
                timeRange
            });

        } catch (error) {
            logger.error('Get execution statistics error', {
                error: error.message,
                userId: req.user?._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve execution statistics',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Kill running execution
    static async killExecution(req, res) {
        try {
            const { executionId } = req.params;
            const userId = req.user?._id;

            const result = await codeExecutionService.killExecution(executionId, userId);

            logger.info('Execution kill attempt', {
                executionId,
                userId,
                success: result.success
            });

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Kill execution error', {
                error: error.message,
                executionId: req.params.executionId,
                userId: req.user?._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to kill execution',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get supported languages
    static async getSupportedLanguages(req, res) {
        try {
            const { SUPPORTED_LANGUAGES } = require('../utils/constants');

            res.json({
                success: true,
                data: {
                    languages: Object.values(SUPPORTED_LANGUAGES),
                    details: {
                        python: {
                            name: 'Python',
                            version: '3.9',
                            extension: '.py',
                            description: 'Python 3.9 with standard library'
                        },
                        javascript: {
                            name: 'JavaScript',
                            version: 'Node.js 16',
                            extension: '.js',
                            description: 'Node.js 16 runtime environment'
                        },
                        cpp: {
                            name: 'C++',
                            version: 'GCC 9',
                            extension: '.cpp',
                            description: 'C++ with GCC 9 compiler'
                        },
                        java: {
                            name: 'Java',
                            version: 'OpenJDK 11',
                            extension: '.java',
                            description: 'Java with OpenJDK 11'
                        }
                    }
                }
            });

        } catch (error) {
            logger.error('Get supported languages error', {
                error: error.message
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve supported languages',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Get code templates
    static async getCodeTemplates(req, res) {
        try {
            const { language } = req.params;
            const { SUPPORTED_LANGUAGES } = require('../utils/constants');

            if (!Object.values(SUPPORTED_LANGUAGES).includes(language)) {
                return res.status(400).json({
                    success: false,
                    message: 'Unsupported language'
                });
            }

            const templates = {
                python: {
                    hello_world: 'print("Hello, World!")',
                    input_output: 'name = input("Enter your name: ")\nprint(f"Hello, {name}!")',
                    fibonacci: 'def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n\nprint(fibonacci(10))'
                },
                javascript: {
                    hello_world: 'console.log("Hello, World!");',
                    input_output: 'const readline = require("readline");\nconst rl = readline.createInterface({\n    input: process.stdin,\n    output: process.stdout\n});\n\nrl.question("Enter your name: ", (name) => {\n    console.log(`Hello, ${name}!`);\n    rl.close();\n});',
                    fibonacci: 'function fibonacci(n) {\n    if (n <= 1) return n;\n    return fibonacci(n-1) + fibonacci(n-2);\n}\n\nconsole.log(fibonacci(10));'
                },
                cpp: {
                    hello_world: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}',
                    input_output: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name;\n    cout << "Enter your name: ";\n    getline(cin, name);\n    cout << "Hello, " << name << "!" << endl;\n    return 0;\n}',
                    fibonacci: '#include <iostream>\nusing namespace std;\n\nint fibonacci(int n) {\n    if (n <= 1) return n;\n    return fibonacci(n-1) + fibonacci(n-2);\n}\n\nint main() {\n    cout << fibonacci(10) << endl;\n    return 0;\n}'
                },
                java: {
                    hello_world: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
                    input_output: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print("Enter your name: ");\n        String name = scanner.nextLine();\n        System.out.println("Hello, " + name + "!");\n        scanner.close();\n    }\n}',
                    fibonacci: 'public class Main {\n    public static int fibonacci(int n) {\n        if (n <= 1) return n;\n        return fibonacci(n-1) + fibonacci(n-2);\n    }\n    \n    public static void main(String[] args) {\n        System.out.println(fibonacci(10));\n    }\n}'
                }
            };

            res.json({
                success: true,
                data: {
                    language,
                    templates: templates[language] || {}
                }
            });

        } catch (error) {
            logger.error('Get code templates error', {
                error: error.message,
                language: req.params.language
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve code templates',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Admin: Get global execution statistics
    static async getGlobalStatistics(req, res) {
        try {
            const timeRange = req.query.timeRange || 'day';
            const stats = await codeExecutionService.getExecutionStatistics(null, timeRange);

            logger.info('Global execution statistics retrieved', {
                timeRange,
                totalExecutions: stats.totalExecutions,
                adminUserId: req.user._id
            });

            res.json({
                success: true,
                data: stats,
                timeRange
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

    // Admin: Cleanup old executions
    static async cleanupOldExecutions(req, res) {
        try {
            const daysOld = parseInt(req.query.daysOld) || 90;
            const result = await codeExecutionService.cleanupOldExecutions(daysOld);

            logger.info('Old executions cleanup completed', {
                daysOld,
                deletedCount: result.deletedCount,
                adminUserId: req.user._id
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
}

module.exports = CodeController;