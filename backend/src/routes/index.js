// src/routes/index.js
const express = require('express');
const codeRoutes = require('./code');
const authRoutes = require('./auth');
const healthRoutes = require('./health');
const userRoutes = require('./user');
const adminRoutes = require('./admin');

const router = express.Router();

// API version and welcome message
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Online Code Compiler API',
        version: '1.0.0',
        documentation: '/api/docs',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            code: '/api/code',
            user: '/api/user',
            admin: '/api/admin'
        },
        supportedLanguages: ['python', 'javascript', 'cpp', 'java'],
        timestamp: new Date().toISOString()
    });
});

// Mount route modules
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/code', codeRoutes);
router.use('/user', userRoutes);
router.use('/admin', adminRoutes);

// API documentation endpoint
router.get('/docs', (req, res) => {
    res.json({
        success: true,
        documentation: {
            title: 'Online Code Compiler API Documentation',
            version: '1.0.0',
            baseUrl: `${req.protocol}://${req.get('host')}/api`,
            endpoints: {
                health: {
                    'GET /health': 'Basic health check',
                    'GET /health/system': 'Detailed system information (admin)',
                    'GET /health/database': 'Database health check',
                    'GET /health/docker': 'Docker health check',
                    'GET /health/readiness': 'Service readiness check',
                    'GET /health/liveness': 'Service liveness check',
                    'GET /health/metrics': 'Application metrics'
                },
                auth: {
                    'POST /auth/register': 'User registration',
                    'POST /auth/login': 'User login',
                    'POST /auth/logout': 'User logout',
                    'POST /auth/refresh': 'Refresh access token',
                    'GET /auth/me': 'Get current user info'
                },
                code: {
                    'POST /code/execute': 'Execute code',
                    'GET /code/history': 'Get execution history',
                    'GET /code/execution/:id': 'Get specific execution',
                    'DELETE /code/execution/:id': 'Delete execution',
                    'POST /code/execution/:id/kill': 'Kill running execution',
                    'GET /code/statistics': 'Get execution statistics',
                    'GET /code/languages': 'Get supported languages',
                    'GET /code/templates/:language': 'Get code templates'
                },
                user: {
                    'GET /user/profile': 'Get user profile',
                    'PUT /user/profile': 'Update user profile',
                    'PUT /user/preferences': 'Update user preferences',
                    'DELETE /user/account': 'Delete user account'
                },
                admin: {
                    'GET /admin/statistics': 'Global statistics',
                    'POST /admin/cleanup': 'Cleanup old executions',
                    'GET /admin/users': 'List all users',
                    'GET /admin/executions': 'List all executions'
                }
            },
            authentication: {
                type: 'Bearer Token',
                header: 'Authorization: Bearer <token>',
                description: 'Include JWT token in Authorization header for protected endpoints'
            },
            rateLimit: {
                general: '100 requests per 15 minutes',
                execution: '10 requests per minute (authenticated), 5 requests per minute (anonymous)',
                authentication: '5 attempts per 15 minutes'
            },
            supportedLanguages: {
                python: {
                    name: 'Python',
                    version: '3.9',
                    extension: '.py'
                },
                javascript: {
                    name: 'JavaScript',
                    version: 'Node.js 16',
                    extension: '.js'
                },
                cpp: {
                    name: 'C++',
                    version: 'GCC 9',
                    extension: '.cpp'
                },
                java: {
                    name: 'Java',
                    version: 'OpenJDK 11',
                    extension: '.java'
                }
            }
        }
    });
});

// 404 handler for API routes
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: [
            '/api/health',
            '/api/auth',
            '/api/code',
            '/api/user',
            '/api/admin',
            '/api/docs'
        ]
    });
});

module.exports = router;