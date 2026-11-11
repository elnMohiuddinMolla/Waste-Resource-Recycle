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

// An account that can receive assignments: role collector and status active
async function findActiveCollector(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT user_id, full_name, zone_id FROM users
     WHERE user_id = ? AND role = 'collector' AND status = 'active'`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  findActiveCollector
};

