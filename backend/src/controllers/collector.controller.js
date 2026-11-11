// ==============================================================================
// Waste Resource Recycle (WRR) - Collector Controller (api-spec.md Module 4)
// ==============================================================================

const AppError = require('../utils/AppError');
const collectorService = require('../services/collector.service');
const { toPositiveInt, toPositiveAmount, cleanText } = require('../utils/validators');
const {
  parseRequestId, parsePaging, parseStatusList, parseDateRange, parseOptionalId, parseReason
} = require('./common');

// Jobs a collector still has to work on
const OPEN_STATUSES = ['Assigned', 'Accepted', 'Collected'];

async function listRequests(req, res, next) {
  try {
    const statuses = parseStatusList(req.query.status, OPEN_STATUSES);
    const zoneId = parseOptionalId(req.query.zone_id, 'zone_id');
    const data = await collectorService.listMyJobs(req.user, { statuses, zoneId });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function accept(req, res, next) {
  try {
    const data = await collectorService.acceptRequest(req.user, parseRequestId(req));
    res.json({ success: true, message: 'Pickup job accepted.', data });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const id = parseRequestId(req);
    const data = await collectorService.rejectRequest(req.user, id, parseReason(req.body));
    res.json({ success: true, message: 'Pickup job rejected and returned to admin queue.', data });
  } catch (err) {
    next(err);
  }
}

async function abort(req, res, next) {
  try {
    const id = parseRequestId(req);
    const data = await collectorService.abortRequest(req.user, id, parseReason(req.body));
    res.json({ success: true, message: 'Pickup cancelled on-site.', data });
  } catch (err) {
    next(err);
  }
}

async function recordWeight(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];

    const requestId = toPositiveInt(body.request_id);
    const weight = toPositiveAmount(body.actual_weight_kg);
    const remarks = cleanText(body.remarks);

    if (!requestId) errors.push({ field: 'request_id', message: 'request_id is required.' });
    if (!weight) errors.push({ field: 'actual_weight_kg', message: 'Actual weight must be greater than 0 kg.' });
    if (remarks.length > 1000) errors.push({ field: 'remarks', message: 'Remarks must be at most 1000 characters.' });
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await collectorService.recordWeight(req.user, requestId, weight, remarks);
    res.status(201).json({ success: true, message: 'Collection weight recorded successfully.', data });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const data = await collectorService.completeRequest(req.user, parseRequestId(req));
    res.json({ success: true, message: 'Pickup completed and reward points posted to user ledger.', data });
  } catch (err) {
    next(err);
  }
}

async function history(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const categoryId = parseOptionalId(req.query.category_id, 'category_id');
    const { page, limit } = parsePaging(req.query);
    const data = await collectorService.history(req.user, { from, to, categoryId, page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRequests,
  accept,
  reject,
  abort,
  recordWeight,
  complete,
  history
};
