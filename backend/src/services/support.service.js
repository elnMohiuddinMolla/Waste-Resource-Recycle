// ==============================================================================
// Waste Resource Recycle (WRR) - Support Ticket Service (PRD v1.5.0, FR-22)
// Users and collectors open tickets; admins answer and close them.
// Open -> Answered (admin replies; may reply again) -> Closed (owner or admin).
// ==============================================================================

const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const supportModel = require('../models/support.model');
const redemptionModel = require('../models/redemption.model');
const { canViewRequest } = require('./pickup.service');
const { createNotification, NOTIFICATION_TYPES } = require('./notification.service');

const CATEGORIES = Object.freeze(['Pickup', 'Points', 'Redemption', 'Account', 'Other']);
const STATUSES = Object.freeze(['Open', 'Answered', 'Closed']);
const MAX_OPEN_TICKETS = 5; // per person, so one account cannot flood the admin

const notFound = (id) => new AppError(404, `Support ticket #${id} not found.`);

async function createTicket(user, data) {
  const errors = [];
  // A linked request or redemption must be one the person can already see
  if (data.requestId && !(await canViewRequest(user, data.requestId))) {
    errors.push({ field: 'request_id', message: 'Choose one of your own pickup requests.' });
  }
  if (data.redemptionId) {
    const owner = await redemptionModel.findOwner(data.redemptionId);
    if (owner !== user.user_id) errors.push({ field: 'redemption_id', message: 'Choose one of your own redemptions.' });
  }
  if (errors.length) throw new AppError(400, 'Validation failed.', errors);

  if ((await supportModel.countOpenByUser(user.user_id)) >= MAX_OPEN_TICKETS) {
    throw new AppError(422, `You already have ${MAX_OPEN_TICKETS} open tickets. Close one or wait for an answer.`);
  }

  const id = await supportModel.insert({ userId: user.user_id, ...data });
  return supportModel.findById(id);
}

async function listMine(user, { page, limit }) {
  const { total, rows } = await supportModel.listByUser(user.user_id, { limit, offset: (page - 1) * limit });
  return { total, page, limit, tickets: rows };
}

async function listForAdmin({ status, page, limit }) {
  const { total, rows } = await supportModel.listForAdmin({ status, limit, offset: (page - 1) * limit });
  return { total, page, limit, tickets: rows };
}

// Admin answers: one transaction for the reply and the owner's notification
async function reply(admin, ticketId, text) {
  await withTransaction(async (conn) => {
    const ticket = await supportModel.findByIdForUpdate(conn, ticketId);
    if (!ticket) throw notFound(ticketId);
    if (ticket.status === 'Closed') throw new AppError(409, 'This ticket is closed.');

    await supportModel.saveReply(conn, ticketId, { adminId: admin.user_id, reply: text });
    await createNotification({
      connection: conn,
      userId: ticket.user_id,
      type: NOTIFICATION_TYPES.SUPPORT_ANSWERED,
      message: `Support ticket #${ticketId} ("${ticket.subject}") has an answer.`
    });
  });
  return supportModel.findById(ticketId);
}

// The owner or an admin closes a ticket; anyone else is told it does not exist
async function close(viewer, ticketId) {
  const ticket = await supportModel.findById(ticketId);
  if (!ticket || (viewer.role !== 'admin' && ticket.user_id !== viewer.user_id)) throw notFound(ticketId);
  if (ticket.status === 'Closed') throw new AppError(409, 'This ticket is already closed.');
  await supportModel.close(ticketId);
  return supportModel.findById(ticketId);
}

module.exports = {
  CATEGORIES,
  STATUSES,
  MAX_OPEN_TICKETS,
  createTicket,
  listMine,
  listForAdmin,
  reply,
  close
};
