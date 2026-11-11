// ==============================================================================
// Waste Resource Recycle (WRR) - Notification Routes (/api/v1/notifications)
// Any logged-in role; every action only touches the caller's own notifications.
// ==============================================================================

const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticateToken, requireRole('user', 'collector', 'admin'));

router.get('/', notificationController.list);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);

module.exports = router;
