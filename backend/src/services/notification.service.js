// ==============================================================================
// Waste Resource Recycle (WRR) - Notification Service
// ==============================================================================

const { pool } = require('../config/db');

// The 11 notification types from PRD FR-14 (recipient in brackets)
const NOTIFICATION_TYPES = Object.freeze({
  PICKUP_SUBMITTED: 'PICKUP_SUBMITTED',         // user
  PICKUP_ASSIGNED: 'PICKUP_ASSIGNED',           // collector
  PICKUP_ACCEPTED: 'PICKUP_ACCEPTED',           // user
  PICKUP_REJECTED: 'PICKUP_REJECTED',           // user (being reassigned)
  PICKUP_ABORTED: 'PICKUP_ABORTED',             // user
  PICKUP_COLLECTED: 'PICKUP_COLLECTED',         // user
  PICKUP_COMPLETED: 'PICKUP_COMPLETED',         // user (points earned)
  REDEMPTION_REQUESTED: 'REDEMPTION_REQUESTED', // user
  REDEMPTION_APPROVED: 'REDEMPTION_APPROVED',   // user
  REDEMPTION_REJECTED: 'REDEMPTION_REJECTED',   // user (points refunded)
  REDEMPTION_PAID: 'REDEMPTION_PAID'            // user (with TrxID)
});

/**
 * Creates an in-website notification for a user.
 * Can be executed inside an existing transaction (pass connection) or standalone.
 */
async function createNotification({ userId, requestId = null, redemptionId = null, type, message, connection = null }) {
  if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
    throw new Error(`Unknown notification type: ${type}`);
  }

  const query = `
    INSERT INTO notifications (user_id, request_id, redemption_id, type, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
  `;
  const params = [userId, requestId, redemptionId, type, message];

  if (connection) {
    const [result] = await connection.execute(query, params);
    return result.insertId;
  } else {
    const [result] = await pool.execute(query, params);
    return result.insertId;
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification
};

