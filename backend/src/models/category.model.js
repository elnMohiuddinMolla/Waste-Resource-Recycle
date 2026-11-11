// ==============================================================================
// Waste Resource Recycle (WRR) - Waste Category Model
// ==============================================================================

const { pool } = require('../config/db');

// Booleans come back from MySQL/MariaDB as 0/1; convert them for the JSON API
function toCategory(row) {
  const c = { ...row, is_other: Boolean(row.is_other) };
  if ('is_active' in row) c.is_active = Boolean(row.is_active);
  return c;
}

// ---------- Public (users) ----------

async function listActive() {
  const [rows] = await pool.execute(
    `SELECT category_id, name, points_per_kg, is_other
     FROM waste_categories
     WHERE is_active = TRUE
     ORDER BY category_id`
  );
  return rows.map(toCategory);
}

async function findActiveById(categoryId) {
  const [rows] = await pool.execute(
    `SELECT category_id, name, points_per_kg, is_other
     FROM waste_categories
     WHERE category_id = ? AND is_active = TRUE`,
    [categoryId]
  );
  return rows[0] ? toCategory(rows[0]) : null;
}

// ---------- Admin (all categories, active and inactive) ----------

const ADMIN_COLUMNS = 'category_id, name, points_per_kg, is_other, is_active';

async function listAll() {
  const [rows] = await pool.execute(
    `SELECT ${ADMIN_COLUMNS} FROM waste_categories ORDER BY category_id`
  );
  return rows.map(toCategory);
}

async function findById(categoryId) {
  const [rows] = await pool.execute(
    `SELECT ${ADMIN_COLUMNS} FROM waste_categories WHERE category_id = ?`,
    [categoryId]
  );
  return rows[0] ? toCategory(rows[0]) : null;
}

// The column collation is case-insensitive, so 'plastic' matches 'Plastic'
async function findByName(name) {
  const [rows] = await pool.execute(
    `SELECT ${ADMIN_COLUMNS} FROM waste_categories WHERE name = ?`,
    [name]
  );
  return rows[0] ? toCategory(rows[0]) : null;
}

async function insert({ name, pointsPerKg, isOther }) {
  const [result] = await pool.execute(
    'INSERT INTO waste_categories (name, points_per_kg, is_other, is_active) VALUES (?, ?, ?, TRUE)',
    [name, pointsPerKg, isOther]
  );
  return result.insertId;
}

// Only the fields that were sent are changed
async function update(categoryId, { name, pointsPerKg, isActive }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (pointsPerKg !== undefined) { sets.push('points_per_kg = ?'); params.push(pointsPerKg); }
  if (isActive !== undefined) { sets.push('is_active = ?'); params.push(isActive); }
  params.push(categoryId);
  await pool.execute(`UPDATE waste_categories SET ${sets.join(', ')} WHERE category_id = ?`, params);
}

module.exports = {
  listActive,
  findActiveById,
  listAll,
  findById,
  findByName,
  insert,
  update
};
