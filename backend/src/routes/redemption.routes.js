// ==============================================================================
// Waste Resource Recycle (WRR) - Cash Redemption Routes (/api/v1/redemptions)
// Admin processing lives in admin.routes.js (/api/v1/admin/redemptions).
// ==============================================================================

const express = require('express');
const redemptionController = require('../controllers/redemption.controller');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticateToken);

router.get('/rules/active', requireRole('user', 'admin'), redemptionController.activeRule);
router.post('/', requireRole('user'), redemptionController.submit);
router.get('/mine', requireRole('user'), redemptionController.listMine);

module.exports = router;
