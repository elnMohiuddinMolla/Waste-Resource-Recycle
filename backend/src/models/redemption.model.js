// ==============================================================================
// Waste Resource Recycle (WRR) - Cash Redemption Model
// ==============================================================================

const { pool } = require('../config/db');

const PUBLIC_COLUMNS = `cr.redemption_id, cr.points_redeemed, cr.cash_amount, cr.payout_method,
  cr.payout_account, cr.payout_trx_id, cr.status, cr.admin_note, cr.requested_at, cr.processed_at`;

// cash_amount is computed by the database: ROUND(points × taka_per_point, 2)
async function insert(connection, { userId, ruleId, points, payoutMethod, payoutAccount }) {
  const [result] = await connection.execute(
    `INSERT INTO cash_redemptions
       (user_id, rule_id, points_redeemed, cash_amount, payout_method, payout_account, status)
     SELECT ?, rule_id, ?, ROUND(? * taka_per_point, 2), ?, ?, 'Pending'
     FROM redemption_rules
     WHERE rule_id = ?`,
    [userId, points, points, payoutMethod, payoutAccount, ruleId]
  );
  return result.insertId;
}

async function findById(connection, redemptionId) {
  const [rows] = await connection.execute(
    `SELECT ${PUBLIC_COLUMNS}, cr.user_id FROM cash_redemptions cr WHERE cr.redemption_id = ?`,
    [redemptionId]
  );
  return rows[0] || null;
}

// The owner's user_id, or null when the redemption does not exist
async function findOwner(redemptionId) {
  const [rows] = await pool.execute('SELECT user_id FROM cash_redemptions WHERE redemption_id = ?', [redemptionId]);
  return rows[0] ? rows[0].user_id : null;
}

// Locks the row so two admins can't process the same redemption at once
async function findByIdForUpdate(connection, redemptionId) {
  const [rows] = await connection.execute(
    `SELECT ${PUBLIC_COLUMNS}, cr.user_id FROM cash_redemptions cr WHERE cr.redemption_id = ? FOR UPDATE`,
    [redemptionId]
  );
  return rows[0] || null;
}

// Every admin action records who did it and when (NFR-08)
async function updateDecision(connection, redemptionId, { status, adminId, adminNote, payoutTrxId }) {
  await connection.execute(
    `UPDATE cash_redemptions
     SET status = ?,
         admin_id = ?,
         admin_note = COALESCE(?, admin_note),
         payout_trx_id = COALESCE(?, payout_trx_id),
         processed_at = NOW()
     WHERE redemption_id = ?`,
    [status, adminId, adminNote, payoutTrxId, redemptionId]
  );
}

async function listByUser(userId, status) {
  const params = [userId];
  let statusSql = '';
  if (status) { statusSql = 'AND cr.status = ?'; params.push(status); }
  const [rows] = await pool.execute(
    `SELECT ${PUBLIC_COLUMNS}
     FROM cash_redemptions cr
     WHERE cr.user_id = ? ${statusSql}
     ORDER BY cr.requested_at DESC, cr.redemption_id DESC`,
    params
  );
  return rows;
}

async function listForAdmin({ status, limit, offset }) {
  const params = [];
  let whereSql = '';
  if (status) { whereSql = 'WHERE cr.status = ?'; params.push(status); }

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM cash_redemptions cr ${whereSql}`,
    params
  );
  // Oldest first, so the admin works through the queue in order
  const [rows] = await pool.execute(
    `SELECT ${PUBLIC_COLUMNS}, cr.user_id, u.full_name AS user_name, u.phone AS user_phone
     FROM cash_redemptions cr
     JOIN users u ON u.user_id = cr.user_id
     ${whereSql}
     ORDER BY cr.requested_at, cr.redemption_id
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
  return { total: Number(total), rows };
}

module.exports = {
  findOwner,
  insert,
  findById,
  findByIdForUpdate,
  updateDecision,
  listByUser,
  listForAdmin
};
