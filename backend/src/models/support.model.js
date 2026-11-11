// ==============================================================================
// Waste Resource Recycle (WRR) - Support Ticket Model (PRD v1.5.0, FR-22)
// All SQL for support_tickets lives here.
// ==============================================================================

const { pool } = require('../config/db');

const COLUMNS = `t.ticket_id, t.user_id, t.category, t.subject, t.message, t.request_id, t.redemption_id,
  t.status, t.admin_reply, t.created_at, t.replied_at, t.closed_at`;

async function insert({ userId, category, subject, message, requestId, redemptionId }) {
  const [result] = await pool.execute(
    `INSERT INTO support_tickets (user_id, category, subject, message, request_id, redemption_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, category, subject, message, requestId, redemptionId]
  );
  return result.insertId;
}

async function findById(ticketId, connection = pool) {
  const [rows] = await connection.execute(`SELECT ${COLUMNS} FROM support_tickets t WHERE t.ticket_id = ?`, [ticketId]);
  return rows[0] || null;
}

// Locks the ticket so two admins can't answer it at the same moment
async function findByIdForUpdate(connection, ticketId) {
  const [rows] = await connection.execute(`SELECT ${COLUMNS} FROM support_tickets t WHERE t.ticket_id = ? FOR UPDATE`, [ticketId]);
  return rows[0] || null;
}

// Tickets that are not closed yet (the limit of 5 per person uses this)
async function countOpenByUser(userId) {
  const [[{ total }]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM support_tickets WHERE user_id = ? AND status <> 'Closed'",
    [userId]
  );
  return Number(total);
}

async function listByUser(userId, { limit, offset }) {
  const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM support_tickets WHERE user_id = ?', [userId]);
  // LIMIT/OFFSET are validated integers; mysql2's execute() can't bind them on MariaDB
  const [rows] = await pool.execute(
    `SELECT ${COLUMNS} FROM support_tickets t WHERE t.user_id = ?
     ORDER BY t.created_at DESC, t.ticket_id DESC LIMIT ${limit} OFFSET ${offset}`,
    [userId]
  );
  return { total: Number(total), rows };
}

async function listForAdmin({ status, limit, offset }) {
  const where = status ? 'WHERE t.status = ?' : '';
  const params = status ? [status] : [];
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM support_tickets t ${where}`, params);
  const [rows] = await pool.execute(
    `SELECT ${COLUMNS}, u.full_name AS user_name, u.role AS user_role, u.email AS user_email, u.phone AS user_phone,
            a.full_name AS admin_name
     FROM support_tickets t
     JOIN users u ON u.user_id = t.user_id
     LEFT JOIN users a ON a.user_id = t.admin_id
     ${where}
     ORDER BY t.created_at DESC, t.ticket_id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return { total: Number(total), rows };
}

async function saveReply(connection, ticketId, { adminId, reply }) {
  await connection.execute(
    "UPDATE support_tickets SET status = 'Answered', admin_reply = ?, admin_id = ?, replied_at = NOW() WHERE ticket_id = ?",
    [reply, adminId, ticketId]
  );
}

async function close(ticketId) {
  await pool.execute(
    "UPDATE support_tickets SET status = 'Closed', closed_at = NOW() WHERE ticket_id = ? AND status <> 'Closed'",
    [ticketId]
  );
}

module.exports = {
  insert,
  findById,
  findByIdForUpdate,
  countOpenByUser,
  listByUser,
  listForAdmin,
  saveReply,
  close
};
