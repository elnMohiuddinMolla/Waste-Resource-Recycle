// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Routes (/api/v1/admin)
// ==============================================================================

const express = require('express');
const adminController = require('../controllers/admin.controller');
const redemptionController = require('../controllers/redemption.controller');
const categoryController = require('../controllers/category.controller');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticateToken, requireRole('admin'));

router.get('/pickup-requests', adminController.listPickupRequests);
router.put('/pickup-requests/:id/assign', adminController.assignCollector);

router.get('/redemptions', redemptionController.listForAdmin);
router.patch('/redemptions/:id', redemptionController.processDecision);

router.get('/categories', categoryController.list);
router.post('/categories', categoryController.create);
router.put('/categories/:id', categoryController.update);

module.exports = router;
