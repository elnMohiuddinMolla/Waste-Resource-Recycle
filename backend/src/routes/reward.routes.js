// ==============================================================================
// Waste Resource Recycle (WRR) - Rewards Routes (/api/v1/rewards)
// ==============================================================================

const express = require('express');
const rewardController = require('../controllers/reward.controller');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticateToken, requireRole('user'));

router.get('/balance', rewardController.balance);
router.get('/history', rewardController.history);

module.exports = router;
