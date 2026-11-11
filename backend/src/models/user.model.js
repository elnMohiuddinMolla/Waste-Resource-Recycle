// ==============================================================================
// Waste Resource Recycle (WRR) - User Model
// ==============================================================================

const { pool } = require('../config/db');

async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function findById(userId) {
  const [rows] = await pool.execute(
    `SELECT u.user_id, u.full_name, u.email, u.phone, u.role, u.address, u.zone_id, u.status, u.created_at,
            z.name AS zone_name
     FROM users u
     LEFT JOIN zones z ON u.zone_id = z.zone_id
     WHERE u.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function createUser({ fullName, email, phone, passwordHash, role = 'user', address, zoneId = null }) {
  const [result] = await pool.execute(
    `INSERT INTO users (full_name, email, phone, password_hash, role, address, zone_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
    [fullName, email, phone, passwordHash, role, address, zoneId]
  );
  return result.insertId;
}

/**
 * Locks the user's row until the transaction ends. Every change to a user's points
 * that depends on their balance (redemption, weight correction) takes this lock
 * first, so two such changes for the same user run one after another.
 */
async function lockById(connection, userId) {
  await connection.execute('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);
}

// An account that can receive assignments: role collector and status active
async function findActiveCollector(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT user_id, full_name, zone_id FROM users
     WHERE user_id = ? AND role = 'collector' AND status = 'active'`,
    [userId]
  );
  return rows[0] || null;
}

// ---------- Admin view (FR-20) ----------

// Never selects password_hash. open_jobs = this collector's unfinished jobs (0 for others).
const ADMIN_SELECT = `
  SELECT u.user_id, u.full_name, u.email, u.phone, u.role, u.address,
         u.zone_id, z.name AS zone_name, u.status, u.created_at,
         (SELECT COUNT(*) FROM pickup_requests pr
          WHERE pr.collector_id = u.user_id
            AND pr.status IN ('Assigned', 'Accepted', 'Collected')) AS open_jobs
  FROM users u
  LEFT JOIN zones z ON z.zone_id = u.zone_id`;

function toAdminView(row) {
  return { ...row, open_jobs: Number(row.open_jobs) };
}

async function listForAdmin({ role, status, zoneId, limit, offset }) {
  const where = [];
  const params = [];
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  if (zoneId) { where.push('u.zone_id = ?'); params.push(zoneId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  // LIMIT/OFFSET are validated integers; mysql2's execute() can't bind them on MariaDB
  const [rows] = await pool.execute(
    `${ADMIN_SELECT} ${whereSql}
     ORDER BY u.role, u.full_name, u.user_id
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
  return { total: Number(total), rows: rows.map(toAdminView) };
}

async function findAdminView(userId) {
  const [rows] = await pool.execute(`${ADMIN_SELECT} WHERE u.user_id = ?`, [userId]);
  return rows[0] ? toAdminView(rows[0]) : null;
}

async function updateStatus(userId, status) {
  await pool.execute('UPDATE users SET status = ? WHERE user_id = ?', [status, userId]);
}

async function updateZone(userId, zoneId) {
  await pool.execute('UPDATE users SET zone_id = ? WHERE user_id = ?', [zoneId, userId]);
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  lockById,
  findActiveCollector,
  listForAdmin,
  findAdminView,
  updateStatus,
  updateZone
};

