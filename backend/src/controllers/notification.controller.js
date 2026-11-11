// ==============================================================================
// Waste Resource Recycle (WRR) - Notification Controller (api-spec.md Module 7)
// ==============================================================================

const AppError = require('../utils/AppError');
const notificationService = require('../services/notification.service');
const { toPositiveInt } = require('../utils/validators');

// ?unread_only=true|false (default false)
function parseUnreadOnly(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new AppError(400, 'Validation failed.', [
    { field: 'unread_only', message: "unread_only must be 'true' or 'false'." }
  ]);
}

async function list(req, res, next) {
  try {
    const unreadOnly = parseUnreadOnly(req.query.unread_only);
    const limit = Math.min(toPositiveInt(req.query.limit) || 20, 50);
    const data = await notificationService.listForUser(req.user, { unreadOnly, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) throw new AppError(404, `Notification #${req.params.id} not found.`);
    await notificationService.markOneRead(req.user, id);
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const data = await notificationService.markAllRead(req.user);
    res.json({ success: true, message: 'All notifications marked as read.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  markRead,
  markAllRead
};
