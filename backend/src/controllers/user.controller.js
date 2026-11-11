// ==============================================================================
// Waste Resource Recycle (WRR) - Admin User & Collector Controller (api-spec.md §8.9)
// ==============================================================================

const AppError = require('../utils/AppError');
const accountService = require('../services/account.service');
const { parseAccountInput } = require('./accountInput');
const { parsePaging, parseOptionalId } = require('./common');
const { toPositiveInt } = require('../utils/validators');

const ROLES = ['user', 'collector', 'admin'];
const STATUSES = ['active', 'inactive'];

function parseUserId(req) {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new AppError(404, `User #${req.params.id} not found.`);
  return id;
}

function parseChoice(value, allowed, field) {
  if (value === undefined || value === '') return null;
  if (!allowed.includes(value)) {
    throw new AppError(400, 'Validation failed.', [
      { field, message: `${field} must be one of: ${allowed.join(', ')}.` }
    ]);
  }
  return value;
}

async function list(req, res, next) {
  try {
    const role = parseChoice(req.query.role, ROLES, 'role');
    const status = parseChoice(req.query.status, STATUSES, 'status');
    const zoneId = parseOptionalId(req.query.zone_id, 'zone_id');
    const { page, limit } = parsePaging(req.query, 20);
    const data = await accountService.listUsers({ role, status, zoneId, page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// Same rules as self-registration, but the role is collector and a zone is required
async function createCollector(req, res, next) {
  try {
    const input = await parseAccountInput(req.body);
    const data = await accountService.createCollector(input);
    res.status(201).json({ success: true, message: 'Collector account created.', data });
  } catch (err) {
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const id = parseUserId(req);
    const status = req.body && req.body.status;
    if (!STATUSES.includes(status)) {
      throw new AppError(400, 'Validation failed.', [{ field: 'status', message: "Status must be 'active' or 'inactive'." }]);
    }
    const data = await accountService.setStatus(req.user, id, status);
    res.json({ success: true, message: `Account is now ${status}.`, data });
  } catch (err) {
    next(err);
  }
}

async function setZone(req, res, next) {
  try {
    const id = parseUserId(req);
    const zoneId = toPositiveInt(req.body && req.body.zone_id);
    if (!zoneId) {
      throw new AppError(400, 'Validation failed.', [{ field: 'zone_id', message: 'Select an active zone.' }]);
    }
    const data = await accountService.setCollectorZone(id, zoneId);
    res.json({ success: true, message: 'Collector zone updated.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  createCollector,
  setStatus,
  setZone
};
