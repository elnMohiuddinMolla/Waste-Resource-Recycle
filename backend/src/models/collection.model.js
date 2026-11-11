// ==============================================================================
// Waste Resource Recycle (WRR) - Collection Record Model
// ==============================================================================

const { pool } = require('../config/db');

/**
 * Inserts the weighing record. The category's current points_per_kg is copied into
 * points_per_kg_applied (rate snapshot), so later rate changes never alter this reward.
 */
async function insert(connection, { requestId, collectorId, categoryId, actualWeightKg, remarks }) {
  const [result] = await connection.execute(
    `INSERT INTO collection_records
       (request_id, collector_id, actual_weight_kg, points_per_kg_applied, collected_at, remarks)
     SELECT ?, ?, ?, wc.points_per_kg, NOW(), ?
     FROM waste_categories wc
     WHERE wc.category_id = ?`,
    [requestId, collectorId, actualWeightKg, remarks, categoryId]
  );
  return result.insertId;
}

// Points are computed by the database with exact DECIMAL maths (no JS float rounding)
async function findByRequestId(connection, requestId) {
  const [rows] = await connection.execute(
    `SELECT record_id, request_id, collector_id, actual_weight_kg, points_per_kg_applied,
            ROUND(actual_weight_kg * points_per_kg_applied, 2) AS calculated_points,
            collected_at, completed_at
     FROM collection_records
     WHERE request_id = ?`,
    [requestId]
  );
  return rows[0] || null;
}

async function markCompleted(connection, recordId) {
  await connection.execute(
    'UPDATE collection_records SET completed_at = NOW() WHERE record_id = ?',
    [recordId]
  );
}

// Collector history (api-spec §4.7): completed records only
async function listCompletedByCollector(collectorId, { from, to, categoryId, limit, offset }) {
  const where = ['cr.collector_id = ?', 'cr.completed_at IS NOT NULL'];
  const params = [collectorId];
  if (from) { where.push('cr.completed_at >= ?'); params.push(from); }
  if (to) { where.push('cr.completed_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(to); }
  if (categoryId) { where.push('pr.category_id = ?'); params.push(categoryId); }
  const whereSql = where.join(' AND ');

  const [[summary]] = await pool.execute(
    `SELECT COUNT(*) AS total_completed_pickups,
            COALESCE(SUM(cr.actual_weight_kg), 0.00) AS total_kg_collected
     FROM collection_records cr
     JOIN pickup_requests pr ON pr.request_id = cr.request_id
     WHERE ${whereSql}`,
    params
  );

  const [rows] = await pool.execute(
    `SELECT cr.record_id, cr.request_id, u.full_name AS user_name, wc.name AS category_name,
            cr.actual_weight_kg, cr.points_per_kg_applied, cr.collected_at, cr.completed_at
     FROM collection_records cr
     JOIN pickup_requests pr ON pr.request_id = cr.request_id
     JOIN users u ON u.user_id = pr.user_id
     JOIN waste_categories wc ON wc.category_id = pr.category_id
     WHERE ${whereSql}
     ORDER BY cr.completed_at DESC, cr.record_id DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );

  return {
    summary: {
      total_completed_pickups: Number(summary.total_completed_pickups),
      total_kg_collected: summary.total_kg_collected
    },
    records: rows
  };
}

module.exports = {
  insert,
  findByRequestId,
  markCompleted,
  listCompletedByCollector
};
