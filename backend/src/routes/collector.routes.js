// ==============================================================================
// Waste Resource Recycle (WRR) - Collector Routes (/api/v1/collector)
// ==============================================================================

const express = require('express');
const collectorController = require('../controllers/collector.controller');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticateToken, requireRole('collector'));

router.get('/requests', collectorController.listRequests);
router.put('/requests/:id/accept', collectorController.accept);
router.put('/requests/:id/reject', collectorController.reject);
router.put('/requests/:id/abort', collectorController.abort);
router.put('/requests/:id/complete', collectorController.complete);
router.post('/collection-records', collectorController.recordWeight);
router.get('/history', collectorController.history);

module.exports = router;
