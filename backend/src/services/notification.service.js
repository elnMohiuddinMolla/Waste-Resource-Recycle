// ==============================================================================
// Waste Resource Recycle (WRR) - Notification Service
// ==============================================================================

const AppError = require('../utils/AppError');
const notificationModel = require('../models/notification.model');

// The 12 notification types from PRD FR-14 (recipient in brackets)
const MAX_MESSAGE = 255; // notifications.message VARCHAR(255)

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
  REDEMPTION_PAID: 'REDEMPTION_PAID',           // user (with TrxID)
  SUPPORT_ANSWERED: 'SUPPORT_ANSWERED'          // user or collector (PRD v1.5.0, FR-22)
});

/**
 * Creates an in-website notification for a user.
 * Pass the transaction's connection so it commits together with the event that
 * caused it; without one it is written on its own.
 */
async function createNotification({ userId, requestId = null, redemptionId = null, type, message, connection = null }) {
  if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
    throw new Error(`Unknown notification type: ${type}`);
  }
  // notifications.message is VARCHAR(255). A long reason could exceed it: MySQL 8 (strict
  // mode) would then refuse the insert and roll back the whole action. Messages put the
  // free text last, so only the end of the reason is cut; the full text stays in its own column.
  const text = message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1)}…` : message;
  return notificationModel.insert(connection || undefined, { userId, requestId, redemptionId, type, message: text });
}

// ---------- Reading and marking (api-spec.md Module 7, FR-14) ----------

async function listForUser(user, { unreadOnly, limit }) {
  const [notifications, unreadCount] = await Promise.all([
    notificationModel.listByUser(user.user_id, { unreadOnly, limit }),
    notificationModel.countUnread(user.user_id)
  ]);
  return { unread_count: unreadCount, notifications };
}

async function markOneRead(user, notificationId) {
  const found = await notificationModel.markRead(user.user_id, notificationId);
  // Someone else's notification looks the same as a missing one
  if (!found) throw new AppError(404, `Notification #${notificationId} not found.`);
}

async function markAllRead(user) {
  return { updated: await notificationModel.markAllRead(user.user_id) };
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  listForUser,
  markOneRead,
  markAllRead
};

