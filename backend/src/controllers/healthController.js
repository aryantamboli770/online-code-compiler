// src/controllers/healthController.js
const dockerService = require('../services/dockerService');
const DatabaseConnection = require('../config/database');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

class HealthController {
    // Basic health check
    static async healthCheck(req, res) {
        try {
            const startTime = Date.now();

            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: process.env.NODE_ENV,
                version: process.env.npm_package_version || '1.0.0',
                services: {
                    api: 'healthy',
                    database: 'unknown',
                    docker: 'unknown'
                },
                system: {
                    memory: Helpers.getMemoryUsage(),
                    cpu: process.cpuUsage(),
                    platform: process.platform,
                    nodeVersion: process.version
                }
            };

            // Check database connection
            try {
                if (DatabaseConnection.isConnected()) {
                    health.services.database = 'healthy';
                } else {
                    health.services.database = 'unhealthy';
                    health.status = 'degraded';
                }
            } catch (error) {
                health.services.database = 'unhealthy';
                health.status = 'degraded';
                logger.warn('Database health check failed', { error: error.message });
            }

            // Check Docker connection
            try {
                const dockerHealth = await dockerService.checkDockerHealth();
                health.services.docker = dockerHealth.healthy ? 'healthy' : 'unhealthy';

                if (!dockerHealth.healthy) {
                    health.status = 'degraded';
                }
            } catch (error) {
                health.services.docker = 'unhealthy';
                health.status = 'degraded';
                logger.warn('Docker health check failed', { error: error.message });
            }

            const responseTime = Date.now() - startTime;
            health.responseTime = `${responseTime}ms`;

            // Determine overall status
            const unhealthyServices = Object.values(health.services).filter(status => status === 'unhealthy');
            if (unhealthyServices.length > 0) {
                health.status = unhealthyServices.length === Object.keys(health.services).length ? 'unhealthy' : 'degraded';
            }

            const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

            res.status(statusCode).json({
                success: health.status !== 'unhealthy',
                data: health
            });

        } catch (error) {
            logger.error('Health check error', {
                error: error.message,
                stack: error.stack
            });

            res.status(503).json({
                success: false,
                status: 'unhealthy',
                message: 'Health check failed',
                timestamp: new Date().toISOString(),
                error: process.env.NODE_ENV === 'development' ? error.message : 'Service unavailable'
            });
        }
    }

    // Detailed system information (admin only)
    static async getSystemInfo(req, res) {
        try {
            const systemInfo = {
                server: {
                    uptime: process.uptime(),
                    platform: process.platform,
                    architecture: process.arch,
                    nodeVersion: process.version,
                    pid: process.pid,
                    environment: process.env.NODE_ENV
                },
                memory: {
                    usage: Helpers.getMemoryUsage(),
                    total: Math.round(require('os').totalmem() / 1024 / 1024),
                    free: Math.round(require('os').freemem() / 1024 / 1024)
                },
                cpu: {
                    usage: process.cpuUsage(),
                    cores: require('os').cpus().length,
                    model: require('os').cpus()[0]?.model || 'Unknown'
                },
                network: {
                    hostname: require('os').hostname(),
                    interfaces: Object.keys(require('os').networkInterfaces())
                },
                docker: null,
                database: null
            };

            // Get Docker information
            try {
                systemInfo.docker = await dockerService.getDockerInfo();
            } catch (error) {
                systemInfo.docker = { error: error.message };
            }

            // Get database information
            try {
                if (DatabaseConnection.isConnected()) {
                    const mongoose = require('mongoose');
                    systemInfo.database = {
                        connected: true,
                        readyState: mongoose.connection.readyState,
                        host: mongoose.connection.host,
                        name: mongoose.connection.name
                    };
                } else {
                    systemInfo.database = { connected: false };
                }
            } catch (error) {
                systemInfo.database = { error: error.message };
            }

            logger.info('System info requested', {
                adminUserId: req.user._id,
                ip: req.ip
            });

            res.json({
                success: true,
                data: systemInfo,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Get system info error', {
                error: error.message,
                adminUserId: req.user._id
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve system information',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }

    // Database health check
    static async databaseHealth(req, res) {
        try {
            const startTime = Date.now();

            const dbHealth = {
                connected: false,
                responseTime: null,
                collections: {},
                indexes: {},
                stats: null
            };

            if (DatabaseConnection.isConnected()) {
                const mongoose = require('mongoose');

                // Test database connection with a simple query
                await mongoose.connection.db.admin().ping();
                dbHealth.connected = true;
                dbHealth.responseTime = `${Date.now() - startTime}ms`;

                // Get collection stats
                const collections = ['users', 'codeexecutions', 'sessions'];
                for (const collectionName of collections) {
                    try {
                        const stats = await mongoose.connection.db.collection(collectionName).stats();
                        dbHealth.collections[collectionName] = {
                            count: stats.count,
                            size: Math.round(stats.size / 1024), // KB
                            avgObjSize: Math.round(stats.avgObjSize || 0)
                        };
                    } catch (error) {
                        dbHealth.collections[collectionName] = { error: 'Collection not found or inaccessible' };
                    }
                }

                // Get database stats
                try {
                    const dbStats = await mongoose.connection.db.stats();
                    dbHealth.stats = {
                        dataSize: Math.round(dbStats.dataSize / 1024 / 1024), // MB
                        storageSize: Math.round(dbStats.storageSize / 1024 / 1024), // MB
                        indexes: dbStats.indexes,
                        objects: dbStats.objects
                    };
                } catch (error) {
                    dbHealth.stats = { error: error.message };
                }
            }

            const statusCode = dbHealth.connected ? 200 : 503;

            res.status(statusCode).json({
                success: dbHealth.connected,
                data: dbHealth,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Database health check error', {
                error: error.message
            });

            res.status(503).json({
                success: false,
                message: 'Database health check failed',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Database unavailable',
                timestamp: new Date().toISOString()
            });
        }
    }

    // Docker health check
    static async dockerHealth(req, res) {
        try {
            const dockerHealth = await dockerService.checkDockerHealth();

            if (dockerHealth.healthy) {
                const dockerInfo = await dockerService.getDockerInfo();
                dockerHealth.info = dockerInfo;
                dockerHealth.activeContainers = dockerService.getActiveContainerCount();
            }

            const statusCode = dockerHealth.healthy ? 200 : 503;

            res.status(statusCode).json({
                success: dockerHealth.healthy,
                data: dockerHealth,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Docker health check error', {
                error: error.message
            });

            res.status(503).json({
                success: false,
                message: 'Docker health check failed',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Docker unavailable',
                timestamp: new Date().toISOString()
            });
        }
    }

    // Service readiness check
    static async readinessCheck(req, res) {
        try {
            const checks = {
                database: false,
                docker: false
            };

            // Check database
            try {
                checks.database = DatabaseConnection.isConnected();
            } catch (error) {
                checks.database = false;
            }

            // Check Docker
            try {
                const dockerHealth = await dockerService.checkDockerHealth();
                checks.docker = dockerHealth.healthy;
            } catch (error) {
                checks.docker = false;
            }

            const ready = Object.values(checks).every(check => check === true);
            const statusCode = ready ? 200 : 503;

            res.status(statusCode).json({
                success: ready,
                ready,
                checks,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Readiness check error', {
                error: error.message
            });

            res.status(503).json({
                success: false,
                ready: false,
                message: 'Readiness check failed',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Service not ready',
                timestamp: new Date().toISOString()
            });
        }
    }

    // Liveness check (simple ping)
    static async livenessCheck(req, res) {
        res.json({
            success: true,
            alive: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }

    // Get application metrics
    static async getMetrics(req, res) {
        try {
            const CodeExecution = require('../../models/CodeExecution');
            const Session = require('../../models/Session');
            const User = require('../../models/User');

            const metrics = {
                executions: await CodeExecution.getExecutionStats('day'),
                sessions: await Session.getSessionStats('day'),
                system: {
                    memory: Helpers.getMemoryUsage(),
                    uptime: process.uptime(),
                    activeContainers: dockerService.getActiveContainerCount()
                },
                database: {
                    users: await User.countDocuments(),
                    executions: await CodeExecution.countDocuments(),
                    sessions: await Session.countDocuments()
                }
            };

            res.json({
                success: true,
                data: metrics,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Get metrics error', {
                error: error.message
            });

            res.status(500).json({
                success: false,
                message: 'Failed to retrieve metrics',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        }
    }
}

module.exports = HealthController;