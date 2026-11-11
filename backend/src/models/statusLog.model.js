// ==============================================================================
// Waste Resource Recycle (WRR) - Request Status Log Model (append-only)
// ==============================================================================

const { pool } = require('../config/db');

// Must be called with the transaction's connection, so the log commits with the change
async function insert(connection, { requestId, changedById, oldStatus, newStatus, note = null }) {
  await connection.execute(
    `INSERT INTO request_status_logs (request_id, changed_by_id, old_status, new_status, note)
     VALUES (?, ?, ?, ?, ?)`,
    [requestId, changedById, oldStatus, newStatus, note]
  );
}

async function listForRequest(requestId) {
  const [rows] = await pool.execute(
    `SELECT l.log_id, l.old_status, l.new_status, l.note, l.changed_at,
            u.full_name AS changed_by
     FROM request_status_logs l
     JOIN users u ON u.user_id = l.changed_by_id
     WHERE l.request_id = ?
     ORDER BY l.changed_at, l.log_id`,
    [requestId]
  );
  return rows;
}

module.exports = {
  insert,
  listForRequest
};
