// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Routes (/api/v1/admin)
// ==============================================================================

const express = require('express');
const adminController = require('../controllers/admin.controller');
const redemptionController = require('../controllers/redemption.controller');
const categoryController = require('../controllers/category.controller');
const zoneController = require('../controllers/zone.controller');
const ruleController = require('../controllers/rule.controller');
const userController = require('../controllers/user.controller');
const recordController = require('../controllers/record.controller');
const reportController = require('../controllers/report.controller');
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

router.get('/zones', zoneController.list);
router.post('/zones', zoneController.create);
router.put('/zones/:id', zoneController.update);

router.get('/redemption-rules', ruleController.list);
router.post('/redemption-rules', ruleController.create);

router.get('/users', userController.list);
router.post('/collectors', userController.createCollector);
router.patch('/users/:id/status', userController.setStatus);
router.patch('/users/:id/zone', userController.setZone);

router.get('/collection-records', recordController.list);
router.put('/collection-records/:id', recordController.correctWeight);

router.get('/reports/:type', reportController.getReport);

module.exports = router;
