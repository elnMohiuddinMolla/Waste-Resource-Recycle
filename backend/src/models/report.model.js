// ==============================================================================
// Waste Resource Recycle (WRR) - Report Model (FR-17)
// The SQL is exactly database.md §6, Queries 2–6.
// `from` / `to` arrive as 'YYYY-MM-DD 00:00:00' / 'YYYY-MM-DD 23:59:59' (whole days).
// `(? IS NULL OR col = ?)` receives the same value twice.
// ==============================================================================

const { pool } = require('../config/db');

// COUNT/SUM can come back as strings; counts are shown as plain numbers
function toNumbers(rows, fields) {
  return rows.map((row) => {
    const out = { ...row };
    for (const f of fields) if (out[f] !== null && out[f] !== undefined) out[f] = Number(out[f]);
    return out;
  });
}

// Report 1 (Query 2): weight collected by zone and category, completed pickups only
async function weightByCategory({ from, to, zoneId, categoryId }) {
  const [rows] = await pool.execute(
    `SELECT
       z.name AS zone_name,
       wc.name AS category_name,
       COUNT(cr.record_id) AS total_pickups,
       COALESCE(SUM(cr.actual_weight_kg), 0.00) AS total_weight_kg
     FROM collection_records cr
     JOIN pickup_requests pr ON cr.request_id = pr.request_id
     JOIN zones z ON pr.zone_id = z.zone_id
     JOIN waste_categories wc ON pr.category_id = wc.category_id
     WHERE pr.status = 'Completed'
       AND cr.completed_at BETWEEN ? AND ?
       AND (? IS NULL OR pr.zone_id = ?)
       AND (? IS NULL OR pr.category_id = ?)
     GROUP BY z.zone_id, z.name, wc.category_id, wc.name
     ORDER BY z.name, total_weight_kg DESC`,
    [from, to, zoneId, zoneId, categoryId, categoryId]
  );
  return toNumbers(rows, ['total_pickups']);
}

// Report 2 (Query 3): requests by status; percentages of the filtered rows add up to 100
async function requestVolumeByStatus({ from, to, zoneId }) {
  const [rows] = await pool.execute(
    `SELECT
       status,
       COUNT(*) AS request_count,
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
     FROM pickup_requests
     WHERE created_at BETWEEN ? AND ?
       AND (? IS NULL OR zone_id = ?)
     GROUP BY status
     ORDER BY request_count DESC`,
    [from, to, zoneId, zoneId]
  );
  return toNumbers(rows, ['request_count']);
}

// Report 3 (Query 4): rejection rate = rejections ÷ (accepts + rejections), from the status logs
async function collectorPerformance({ from, to, zoneId }) {
  const [rows] = await pool.execute(
    `SELECT
       u.user_id AS collector_id,
       u.full_name AS collector_name,
       z.name AS primary_zone,
       COALESCE(coll.completed_pickups, 0) AS completed_pickups,
       COALESCE(coll.total_kg_collected, 0.00) AS total_kg_collected,
       COALESCE(d.rejected_count, 0) AS rejection_count,
       ROUND(COALESCE(d.rejected_count, 0) * 100.0 /
             NULLIF(COALESCE(d.accepted_count, 0) + COALESCE(d.rejected_count, 0), 0), 2) AS rejection_rate_percentage
     FROM users u
     LEFT JOIN zones z ON u.zone_id = z.zone_id
     LEFT JOIN (
       SELECT cr.collector_id, COUNT(*) AS completed_pickups, SUM(cr.actual_weight_kg) AS total_kg_collected
       FROM collection_records cr
       WHERE cr.completed_at BETWEEN ? AND ?
       GROUP BY cr.collector_id
     ) coll ON u.user_id = coll.collector_id
     LEFT JOIN (
       SELECT changed_by_id,
              SUM(new_status = 'Accepted') AS accepted_count,
              SUM(new_status = 'Rejected') AS rejected_count
       FROM request_status_logs
       WHERE old_status = 'Assigned' AND new_status IN ('Accepted', 'Rejected')
         AND changed_at BETWEEN ? AND ?
       GROUP BY changed_by_id
     ) d ON u.user_id = d.changed_by_id
     WHERE u.role = 'collector'
       AND (? IS NULL OR u.zone_id = ?)
     ORDER BY total_kg_collected DESC`,
    [from, to, from, to, zoneId, zoneId]
  );
  return toNumbers(rows, ['completed_pickups', 'rejection_count']);
}

// Report 4 (Query 5): all-time points balance sheet (dates are not used)
async function pointLiability() {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN txn_type = 'EARN' THEN points ELSE 0 END), 0.00) AS total_points_issued,
       COALESCE(SUM(CASE WHEN txn_type = 'REDEEM' THEN -points ELSE 0 END), 0.00) AS total_points_redeemed,
       COALESCE(SUM(CASE WHEN txn_type = 'REFUND' THEN points ELSE 0 END), 0.00) AS total_points_refunded,
       COALESCE(SUM(CASE WHEN txn_type = 'ADJUST' THEN points ELSE 0 END), 0.00) AS total_points_adjusted,
       COALESCE(SUM(points), 0.00) AS net_outstanding_point_liability,
       ROUND(COALESCE(SUM(points), 0.00) * (
         SELECT taka_per_point FROM redemption_rules WHERE is_active = TRUE
       ), 2) AS estimated_cash_liability_bdt
     FROM reward_transactions`
  );
  return rows;
}

// Report 5 (Query 6): cash redemptions by status
async function redemptionSummary({ from, to }) {
  const [rows] = await pool.execute(
    `SELECT
       status,
       COUNT(*) AS redemption_count,
       COALESCE(SUM(points_redeemed), 0.00) AS total_points,
       COALESCE(SUM(cash_amount), 0.00) AS total_cash_bdt
     FROM cash_redemptions
     WHERE requested_at BETWEEN ? AND ?
     GROUP BY status
     ORDER BY FIELD(status, 'Pending', 'Approved', 'Paid', 'Rejected')`,
    [from, to]
  );
  return toNumbers(rows, ['redemption_count']);
}

module.exports = {
  weightByCategory,
  requestVolumeByStatus,
  collectorPerformance,
  pointLiability,
  redemptionSummary
};
