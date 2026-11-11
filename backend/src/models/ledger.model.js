// ==============================================================================
// Waste Resource Recycle (WRR) - Reward Ledger Model (reward_transactions)
// Signed rows: + credit, - debit. Balance = SUM(points).
// ==============================================================================

const { pool } = require('../config/db');

/**
 * EARN row for a completed collection: ROUND(actual_weight_kg × points_per_kg_applied, 2),
 * computed by the database. The UNIQUE index uq_rt_one_earn makes a second EARN for the
 * same record fail, even if the application had a bug.
 */
async function insertEarn(connection, { userId, recordId }) {
  await connection.execute(
    `INSERT INTO reward_transactions (user_id, txn_type, record_id, points)
     SELECT ?, 'EARN', record_id, ROUND(actual_weight_kg * points_per_kg_applied, 2)
     FROM collection_records
     WHERE record_id = ?`,
    [userId, recordId]
  );
  const [rows] = await connection.execute(
    "SELECT points FROM reward_transactions WHERE record_id = ? AND txn_type = 'EARN'",
    [recordId]
  );
  return rows[0].points;
}

// REDEEM (negative) when a redemption is submitted; REFUND (positive) when it is rejected
async function insertRedemptionRow(connection, { userId, redemptionId, txnType, points }) {
  await connection.execute(
    `INSERT INTO reward_transactions (user_id, txn_type, redemption_id, points)
     VALUES (?, ?, ?, ?)`,
    [userId, txnType, redemptionId, points]
  );
}

// ADJUST (signed) after an admin weight correction (FR-18)
async function insertAdjust(connection, { userId, recordId, points }) {
  await connection.execute(
    `INSERT INTO reward_transactions (user_id, txn_type, record_id, points)
     VALUES (?, 'ADJUST', ?, ?)`,
    [userId, recordId, points]
  );
}

// Pass the transaction connection when the balance is used for a decision
async function getBalance(userId, connection = pool) {
  const [[row]] = await connection.execute(
    'SELECT COALESCE(SUM(points), 0.00) AS balance FROM reward_transactions WHERE user_id = ?',
    [userId]
  );
  return row.balance; // DECIMAL as string, e.g. '55.00'
}

// Ledger rows with the details needed to describe each one (api-spec §5.2)
async function listByUser(userId, { limit, offset }) {
  const [[{ total }]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM reward_transactions WHERE user_id = ?',
    [userId]
  );

  const [rows] = await pool.execute(
    `SELECT rt.transaction_id, rt.txn_type, rt.points, rt.created_at,
            rt.record_id, cr.request_id, cr.actual_weight_kg, wc.name AS category_name,
            rt.redemption_id, cre.payout_method
     FROM reward_transactions rt
     LEFT JOIN collection_records cr ON cr.record_id = rt.record_id
     LEFT JOIN pickup_requests pr ON pr.request_id = cr.request_id
     LEFT JOIN waste_categories wc ON wc.category_id = pr.category_id
     LEFT JOIN cash_redemptions cre ON cre.redemption_id = rt.redemption_id
     WHERE rt.user_id = ?
     ORDER BY rt.created_at DESC, rt.transaction_id DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    [userId]
  );

  return { total: Number(total), rows };
}

module.exports = {
  insertEarn,
  insertRedemptionRow,
  insertAdjust,
  getBalance,
  listByUser
};
