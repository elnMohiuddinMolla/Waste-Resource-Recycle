// ==============================================================================
// Waste Resource Recycle (WRR) - Pickup Request Model
// ==============================================================================

const { pool } = require('../config/db');

async function insert(connection, r) {
  const [result] = await connection.execute(
    `INSERT INTO pickup_requests
       (user_id, category_id, zone_id, pickup_address, contact_phone,
        other_description, estimated_weight_kg, preferred_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
    [r.userId, r.categoryId, r.zoneId, r.pickupAddress, r.contactPhone,
      r.otherDescription, r.estimatedWeightKg, r.preferredAt]
  );
  return result.insertId;
}

async function findById(requestId) {
  const [rows] = await pool.execute(
    'SELECT request_id, status, created_at FROM pickup_requests WHERE request_id = ?',
    [requestId]
  );
  return rows[0] || null;
}

// Locks the row until the transaction ends, so two changes can't race each other
async function findByIdForUpdate(connection, requestId) {
  const [rows] = await connection.execute(
    `SELECT pr.request_id, pr.user_id, pr.collector_id, pr.category_id, pr.status,
            wc.name AS category_name
     FROM pickup_requests pr
     JOIN waste_categories wc ON wc.category_id = pr.category_id
     WHERE pr.request_id = ?
     FOR UPDATE`,
    [requestId]
  );
  return rows[0] || null;
}

async function updateStatus(connection, requestId, status) {
  await connection.execute(
    'UPDATE pickup_requests SET status = ? WHERE request_id = ?',
    [status, requestId]
  );
}

// T1 / T2: admin assigns (or reassigns) a collector
async function assignCollector(connection, requestId, collectorId) {
  await connection.execute(
    "UPDATE pickup_requests SET status = 'Assigned', collector_id = ? WHERE request_id = ?",
    [collectorId, requestId]
  );
}

// T5: collector rejects; the request goes back to the admin queue without a collector
async function markRejected(connection, requestId) {
  await connection.execute(
    "UPDATE pickup_requests SET status = 'Rejected', collector_id = NULL WHERE request_id = ?",
    [requestId]
  );
}

// Admin queue (api-spec §8.1)
async function listForAdmin({ status, zoneId, limit, offset }) {
  const where = [];
  const params = [];
  if (status) { where.push('pr.status = ?'); params.push(status); }
  if (zoneId) { where.push('pr.zone_id = ?'); params.push(zoneId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM pickup_requests pr ${whereSql}`,
    params
  );

  // LIMIT/OFFSET are validated integers; mysql2's execute() can't bind them on MariaDB
  const [rows] = await pool.execute(
    `SELECT pr.request_id, u.full_name AS user_name, pr.contact_phone AS user_phone,
            wc.name AS category_name, pr.zone_id, z.name AS zone_name,
            pr.estimated_weight_kg, pr.preferred_at, pr.status,
            pr.collector_id, c.full_name AS collector_name, pr.created_at
     FROM pickup_requests pr
     JOIN users u ON u.user_id = pr.user_id
     JOIN waste_categories wc ON wc.category_id = pr.category_id
     JOIN zones z ON z.zone_id = pr.zone_id
     LEFT JOIN users c ON c.user_id = pr.collector_id
     ${whereSql}
     ORDER BY pr.preferred_at, pr.request_id
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );

  return { total: Number(total), rows };
}

// Collector's own jobs (api-spec §4.1)
async function listForCollector(collectorId, { statuses, zoneId }) {
  const params = [collectorId, ...statuses];
  let zoneSql = '';
  if (zoneId) { zoneSql = 'AND pr.zone_id = ?'; params.push(zoneId); }

  const [rows] = await pool.execute(
    `SELECT pr.request_id, u.full_name AS user_name, pr.contact_phone, pr.pickup_address,
            z.name AS zone_name, wc.name AS category_name, pr.other_description,
            pr.estimated_weight_kg, pr.preferred_at, pr.status
     FROM pickup_requests pr
     JOIN users u ON u.user_id = pr.user_id
     JOIN waste_categories wc ON wc.category_id = pr.category_id
     JOIN zones z ON z.zone_id = pr.zone_id
     WHERE pr.collector_id = ?
       AND pr.status IN (${statuses.map(() => '?').join(', ')})
       ${zoneSql}
     ORDER BY pr.preferred_at, pr.request_id`,
    params
  );
  return rows;
}

async function listByUser(userId, { status, limit, offset }) {
  const where = ['pr.user_id = ?'];
  const params = [userId];
  if (status) {
    where.push('pr.status = ?');
    params.push(status);
  }
  const whereSql = where.join(' AND ');

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM pickup_requests pr WHERE ${whereSql}`,
    params
  );

  // LIMIT/OFFSET are validated integers; mysql2's execute() can't bind them on MariaDB
  const [rows] = await pool.execute(
    `SELECT pr.request_id, pr.category_id, wc.name AS category_name,
            pr.zone_id, z.name AS zone_name, pr.pickup_address,
            pr.estimated_weight_kg, cr.actual_weight_kg, pr.preferred_at,
            pr.status, c.full_name AS collector_name, pr.created_at
     FROM pickup_requests pr
     JOIN waste_categories wc ON wc.category_id = pr.category_id
     JOIN zones z ON z.zone_id = pr.zone_id
     LEFT JOIN users c ON c.user_id = pr.collector_id
     LEFT JOIN collection_records cr ON cr.request_id = pr.request_id
     WHERE ${whereSql}
     ORDER BY pr.created_at DESC, pr.request_id DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );

  return { total: Number(total), rows };
}

async function findDetails(requestId) {
  const [rows] = await pool.execute(
    `SELECT pr.request_id, pr.user_id, pr.collector_id, pr.status,
            wc.name AS category_name, wc.points_per_kg,
            z.name AS zone_name, pr.pickup_address, pr.contact_phone,
            pr.other_description, pr.estimated_weight_kg,
            cr.actual_weight_kg, cr.points_per_kg_applied,
            earn.points AS points_earned,
            pr.preferred_at, pr.created_at,
            u.full_name AS user_name,
            c.full_name AS collector_name, c.phone AS collector_phone
     FROM pickup_requests pr
     JOIN waste_categories wc ON wc.category_id = pr.category_id
     JOIN zones z ON z.zone_id = pr.zone_id
     JOIN users u ON u.user_id = pr.user_id
     LEFT JOIN users c ON c.user_id = pr.collector_id
     LEFT JOIN collection_records cr ON cr.request_id = pr.request_id
     LEFT JOIN reward_transactions earn
            ON earn.record_id = cr.record_id AND earn.txn_type = 'EARN'
     WHERE pr.request_id = ?`,
    [requestId]
  );
  return rows[0] || null;
}

module.exports = {
  insert,
  findById,
  findByIdForUpdate,
  updateStatus,
  assignCollector,
  markRejected,
  listForAdmin,
  listForCollector,
  listByUser,
  findDetails
};
