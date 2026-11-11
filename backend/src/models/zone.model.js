// ==============================================================================
// Waste Resource Recycle (WRR) - Zone Model
// ==============================================================================

const { pool } = require('../config/db');

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

module.exports = {
  findActiveById,
  listActive
};
