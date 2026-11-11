// ==============================================================================
// Waste Resource Recycle (WRR) - Zone Model
// ==============================================================================

const { pool } = require('../config/db');

// ---------- Public / validation ----------

async function findActiveById(zoneId) {
  const [rows] = await pool.execute(
    'SELECT zone_id, name FROM zones WHERE zone_id = ? AND is_active = TRUE',
    [zoneId]
  );
  return rows[0] || null;
}

async function listActive() {
  const [rows] = await pool.execute(
    'SELECT zone_id, name, description FROM zones WHERE is_active = TRUE ORDER BY zone_id'
  );
  return rows;
}

// ---------- Admin (all zones, active and inactive) ----------

function toZone(row) {
  return { ...row, is_active: Boolean(row.is_active) };
}

const ADMIN_COLUMNS = 'zone_id, name, description, is_active';

async function listAll() {
  const [rows] = await pool.execute(`SELECT ${ADMIN_COLUMNS} FROM zones ORDER BY zone_id`);
  return rows.map(toZone);
}

async function findById(zoneId) {
  const [rows] = await pool.execute(`SELECT ${ADMIN_COLUMNS} FROM zones WHERE zone_id = ?`, [zoneId]);
  return rows[0] ? toZone(rows[0]) : null;
}

// The column collation is case-insensitive, so 'zone 1' matches 'Zone 1'
async function findByName(name) {
  const [rows] = await pool.execute(`SELECT ${ADMIN_COLUMNS} FROM zones WHERE name = ?`, [name]);
  return rows[0] ? toZone(rows[0]) : null;
}

async function insert({ name, description }) {
  const [result] = await pool.execute(
    'INSERT INTO zones (name, description, is_active) VALUES (?, ?, TRUE)',
    [name, description]
  );
  return result.insertId;
}

// Only the fields that were sent are changed
async function update(zoneId, { name, description, isActive }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description); }
  if (isActive !== undefined) { sets.push('is_active = ?'); params.push(isActive); }
  params.push(zoneId);
  await pool.execute(`UPDATE zones SET ${sets.join(', ')} WHERE zone_id = ?`, params);
}

module.exports = {
  findActiveById,
  listActive,
  listAll,
  findById,
  findByName,
  insert,
  update
};
