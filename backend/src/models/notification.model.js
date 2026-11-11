// ==============================================================================
// Waste Resource Recycle (WRR) - Notification Model
// Every query is limited to the caller's own rows (WHERE user_id = ?).
// ==============================================================================

const { pool } = require('../config/db');

// Booleans come back from MySQL/MariaDB as 0/1; convert them for the JSON API
function toNotification(row) {
  return { ...row, is_read: Boolean(row.is_read) };
}

async function listByUser(userId, { unreadOnly, limit }) {
  const unreadSql = unreadOnly ? 'AND is_read = FALSE' : '';
  // LIMIT is a validated integer; mysql2's execute() can't bind it on MariaDB
  const [rows] = await pool.execute(
    `SELECT notification_id, type, message, is_read, request_id, redemption_id, created_at
     FROM notifications
     WHERE user_id = ? ${unreadSql}
     ORDER BY created_at DESC, notification_id DESC
     LIMIT ${Number(limit)}`,
    [userId]
  );
  return rows.map(toNotification);
}

// All unread rows of the user, not only the ones on the current page (badge count)
async function countUnread(userId) {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [userId]
  );
  return Number(row.n);
}

// Returns false when the notification does not exist or belongs to someone else
async function markRead(userId, notificationId) {
  const [result] = await pool.execute(
    'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
    [notificationId, userId]
  );
  // affectedRows counts matched rows, so an already-read notification still returns true
  return result.affectedRows === 1;
}

async function markAllRead(userId) {
  const [result] = await pool.execute(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
    [userId]
  );
  return result.affectedRows;
}

module.exports = {
  listByUser,
  countUnread,
  markRead,
  markAllRead
};
