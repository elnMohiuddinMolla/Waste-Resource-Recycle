// ==============================================================================
// Waste Resource Recycle (WRR) - Redemption Rule Model
// Only one row can be active (UNIQUE index uq_rule_single_active).
// ==============================================================================

const { pool } = require('../config/db');

async function findActive(connection = pool) {
  const [rows] = await connection.execute(
    `SELECT rule_id, taka_per_point, min_points, effective_from
     FROM redemption_rules
     WHERE is_active = TRUE`
  );
  return rows[0] || null;
}

// ---------- Admin ----------

const ADMIN_SELECT = `
  SELECT r.rule_id, r.taka_per_point, r.min_points, r.is_active, r.effective_from,
         r.updated_by, u.full_name AS updated_by_name
  FROM redemption_rules r
  JOIN users u ON u.user_id = r.updated_by`;

function toRule(row) {
  return { ...row, is_active: Boolean(row.is_active) };
}

// Newest first, so the archive reads as a history
async function listAll() {
  const [rows] = await pool.execute(`${ADMIN_SELECT} ORDER BY r.effective_from DESC, r.rule_id DESC`);
  return rows.map(toRule);
}

async function findById(connection, ruleId) {
  const [rows] = await connection.execute(`${ADMIN_SELECT} WHERE r.rule_id = ?`, [ruleId]);
  return rows[0] ? toRule(rows[0]) : null;
}

// Step 1 of a rule switch. Must run before insert() because of the UNIQUE index.
// Locking every rule row first makes two admins' switches run one after another
// (the second waits here), so they can never both insert an active rule.
async function deactivateAll(connection) {
  await connection.execute('SELECT rule_id FROM redemption_rules FOR UPDATE');
  await connection.execute('UPDATE redemption_rules SET is_active = FALSE WHERE is_active = TRUE');
}

// Step 2: the new rule becomes the only active one
async function insert(connection, { takaPerPoint, minPoints, updatedBy }) {
  const [result] = await connection.execute(
    `INSERT INTO redemption_rules (taka_per_point, min_points, is_active, updated_by, effective_from)
     VALUES (?, ?, TRUE, ?, NOW())`,
    [takaPerPoint, minPoints, updatedBy]
  );
  return result.insertId;
}

module.exports = {
  findActive,
  listAll,
  findById,
  deactivateAll,
  insert
};
