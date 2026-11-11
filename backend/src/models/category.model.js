// ==============================================================================
// Waste Resource Recycle (WRR) - Waste Category Model
// ==============================================================================

const { pool } = require('../config/db');

// Booleans come back from MySQL/MariaDB as 0/1; convert them for the JSON API
function toCategory(row) {
  return { ...row, is_other: Boolean(row.is_other) };
}

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

module.exports = {
  listActive,
  findActiveById
};
