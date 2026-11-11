// ==============================================================================
// Waste Resource Recycle (WRR) - Support Ticket Routes (/api/v1/support-tickets)
// PRD v1.5.0, FR-22. The admin side is in admin.routes.js.
// ==============================================================================

const express = require('express');
const supportController = require('../controllers/support.controller');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticateToken);

router.post('/', requireRole('user', 'collector'), supportController.create);
router.get('/mine', requireRole('user', 'collector'), supportController.listMine);
router.patch('/:id/close', requireRole('user', 'collector', 'admin'), supportController.close);

module.exports = router;
