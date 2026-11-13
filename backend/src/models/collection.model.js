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

// ---------- Admin: records + weight correction (api-spec §8.5, FR-18) ----------

// Points already posted for a record = its EARN row plus every ADJUST row
const POINTS_POSTED_SQL = `(SELECT COALESCE(SUM(rt.points), 0.00) FROM reward_transactions rt
   WHERE rt.record_id = cr.record_id AND rt.txn_type IN ('EARN', 'ADJUST'))`;

async function listForAdmin({ from, to, zoneId, limit, offset }) {
  const where = [];
  const params = [];
  if (from) { where.push('cr.collected_at >= ?'); params.push(from); }
  if (to) { where.push('cr.collected_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(to); }
  if (zoneId) { where.push('pr.zone_id = ?'); params.push(zoneId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM collection_records cr
     JOIN pickup_requests pr ON pr.request_id = cr.request_id
     ${whereSql}`,
    params
  );

  const [rows] = await pool.execute(
    `SELECT cr.record_id, cr.request_id, pr.status AS request_status,
            u.full_name AS user_name, c.full_name AS collector_name,
            wc.name AS category_name, z.name AS zone_name,
            cr.actual_weight_kg, cr.points_per_kg_applied,
            ${POINTS_POSTED_SQL} AS points_posted,
            cr.remarks, cr.collected_at, cr.completed_at
     FROM collection_records cr
     JOIN pickup_requests pr ON pr.request_id = cr.request_id
     JOIN users u ON u.user_id = pr.user_id
     JOIN users c ON c.user_id = cr.collector_id
     JOIN waste_categories wc ON wc.category_id = pr.category_id
     JOIN zones z ON z.zone_id = pr.zone_id
     ${whereSql}
     ORDER BY cr.collected_at DESC, cr.record_id DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
  return { total: Number(total), rows };
}

// Locks the record and its request, and returns what a correction needs
async function findForCorrection(connection, recordId) {
  const [rows] = await connection.execute(
    `SELECT cr.record_id, cr.request_id, cr.actual_weight_kg, cr.points_per_kg_applied,
            pr.user_id, pr.status AS request_status
     FROM collection_records cr
     JOIN pickup_requests pr ON pr.request_id = cr.request_id
     WHERE cr.record_id = ?
     FOR UPDATE`,
    [recordId]
  );
  return rows[0] || null;
}

/**
 * The signed ADJUST needed so the record's total becomes ROUND(new_kg × rate, 2).
 * Computed by the database with exact DECIMAL maths (api-spec §8.5). The new weight
 * arrives as a DOUBLE, so it is CAST to DECIMAL first (1.15 kg × 1.50 = 1.73, as the
 * EARN row computes it, not 1.72).
 */
async function adjustmentFor(connection, recordId, newWeightKg) {
  const [[row]] = await connection.execute(
    `SELECT ROUND(CAST(? AS DECIMAL(10,2)) * cr.points_per_kg_applied, 2) - ${POINTS_POSTED_SQL} AS delta
     FROM collection_records cr
     WHERE cr.record_id = ?`,
    [newWeightKg, recordId]
  );
  return row.delta; // DECIMAL string, e.g. '-35.00'
}

async function updateWeight(connection, recordId, { actualWeightKg, remarks }) {
  // Remarks are only replaced when the admin sends new ones
  await connection.execute(
    `UPDATE collection_records
     SET actual_weight_kg = ?, remarks = COALESCE(?, remarks)
     WHERE record_id = ?`,
    [actualWeightKg, remarks, recordId]
  );
}

module.exports = {
  insert,
  findByRequestId,
  markCompleted,
  listCompletedByCollector,
  listForAdmin,
  findForCorrection,
  adjustmentFor,
  updateWeight
};
