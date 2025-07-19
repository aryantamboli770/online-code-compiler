// src/routes/health.js
const express = require('express');
const HealthController = require('../controllers/healthController');
const AuthMiddleware = require('../middleware/auth');

const router = express.Router();

// Basic health check (public)
router.get('/', HealthController.healthCheck);

// Detailed system information (admin only)
router.get('/system',
    AuthMiddleware.verifyToken,
    AuthMiddleware.requireAdmin,
    HealthController.getSystemInfo
);

// Database health check (public)
router.get('/database', HealthController.databaseHealth);

// Docker health check (public)
router.get('/docker', HealthController.dockerHealth);

// Service readiness check (public)
router.get('/readiness', HealthController.readinessCheck);

// Service liveness check (public)
router.get('/liveness', HealthController.livenessCheck);

// Application metrics (public)
router.get('/metrics', HealthController.getMetrics);

module.exports = router;