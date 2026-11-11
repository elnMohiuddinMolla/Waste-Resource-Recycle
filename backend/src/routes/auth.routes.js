// ==============================================================================
// Waste Resource Recycle (WRR) - Authentication Routes (/api/v1/auth)
// ==============================================================================

const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authenticateToken, authController.logout);
router.get('/me', authenticateToken, authController.getProfile);

module.exports = router;
