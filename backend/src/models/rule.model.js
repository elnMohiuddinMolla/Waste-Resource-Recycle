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

module.exports = {
  findActive
};
