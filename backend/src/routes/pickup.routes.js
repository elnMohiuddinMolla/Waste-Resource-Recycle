// ==============================================================================
// Waste Resource Recycle (WRR) - Pickup Request Routes (/api/v1/pickup-requests)
// ==============================================================================

const express = require('express');
const pickupController = require('../controllers/pickup.controller');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticateToken);

router.post('/', requireRole('user'), pickupController.create);
router.get('/mine', requireRole('user'), pickupController.listMine);
router.get('/:id', requireRole('user', 'collector', 'admin'), pickupController.getOne);
router.put('/:id/cancel', requireRole('user'), pickupController.cancel);

module.exports = router;
