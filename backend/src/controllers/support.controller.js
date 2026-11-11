// ==============================================================================
// Waste Resource Recycle (WRR) - Support Ticket Controller (PRD v1.5.0, FR-22)
// Checks the shape of the input, then calls support.service.
// ==============================================================================

const AppError = require('../utils/AppError');
const supportService = require('../services/support.service');
const { cleanText, toPositiveInt } = require('../utils/validators');
const { parsePaging, parseOptionalId } = require('./common');

function parseTicketId(req) {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new AppError(404, `Support ticket #${req.params.id} not found.`);
  return id;
}

// POST /support-tickets (user, collector)
async function create(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];
    const category = cleanText(body.category);
    const subject = cleanText(body.subject);
    const message = cleanText(body.message);

    if (!supportService.CATEGORIES.includes(category)) {
      errors.push({ field: 'category', message: `Choose one of: ${supportService.CATEGORIES.join(', ')}.` });
    }
    if (subject.length < 5 || subject.length > 120) errors.push({ field: 'subject', message: 'Subject must be 5 to 120 characters.' });
    if (message.length < 10 || message.length > 2000) errors.push({ field: 'message', message: 'Describe the problem in 10 to 2000 characters.' });
    let requestId = null;
    let redemptionId = null;
    try { requestId = parseOptionalId(body.request_id ?? '', 'request_id'); } catch (e) { errors.push(...e.errors); }
    try { redemptionId = parseOptionalId(body.redemption_id ?? '', 'redemption_id'); } catch (e) { errors.push(...e.errors); }
    if (errors.length) throw new AppError(400, 'Validation failed.', errors);

    const ticket = await supportService.createTicket(req.user, { category, subject, message, requestId, redemptionId });
    res.status(201).json({ success: true, message: 'Support ticket sent. An admin will answer soon.', data: ticket });
  } catch (err) {
    next(err);
  }
}

// GET /support-tickets/mine (user, collector)
async function listMine(req, res, next) {
  try {
    const data = await supportService.listMine(req.user, parsePaging(req.query));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// PATCH /support-tickets/:id/close (owner or admin)
async function close(req, res, next) {
  try {
    const ticket = await supportService.close(req.user, parseTicketId(req));
    res.json({ success: true, message: 'Ticket closed.', data: ticket });
  } catch (err) {
    next(err);
  }
}

// GET /admin/support-tickets?status=&page=&limit=
async function listForAdmin(req, res, next) {
  try {
    const status = cleanText(req.query.status);
    if (status && !supportService.STATUSES.includes(status)) {
      throw new AppError(400, 'Validation failed.', [{ field: 'status', message: `status must be one of: ${supportService.STATUSES.join(', ')}.` }]);
    }
    const data = await supportService.listForAdmin({ status: status || null, ...parsePaging(req.query, 20) });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// PUT /admin/support-tickets/:id/reply { reply }
async function reply(req, res, next) {
  try {
    const id = parseTicketId(req);
    const text = cleanText((req.body || {}).reply);
    if (text.length < 2 || text.length > 2000) {
      throw new AppError(400, 'Validation failed.', [{ field: 'reply', message: 'Reply must be 2 to 2000 characters.' }]);
    }
    const ticket = await supportService.reply(req.user, id, text);
    res.json({ success: true, message: 'Reply sent. The person has been notified.', data: ticket });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, listMine, close, listForAdmin, reply };
