// ==============================================================================
// Waste Resource Recycle (WRR) - Small helpers shared by controllers
// ==============================================================================

const AppError = require('../utils/AppError');
const { toPositiveInt, cleanText } = require('../utils/validators');
const { STATUSES } = require('../services/requestStateMachine');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ":id" in the URL; a non-number is treated like a missing request
function parseRequestId(req) {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new AppError(404, `Pickup request #${req.params.id} not found.`);
  return id;
}

// ?page=&limit= with safe defaults (limit capped at 50)
function parsePaging(query, defaultLimit = 10) {
  return {
    page: toPositiveInt(query.page) || 1,
    limit: Math.min(toPositiveInt(query.limit) || defaultLimit, 50)
  };
}

// ?status=Pending or ?status=Assigned,Accepted -> array of valid statuses (or the default)
function parseStatusList(value, defaults) {
  if (!value) return defaults;
  const list = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((s) => !STATUSES.includes(s));
  if (bad.length > 0 || list.length === 0) {
    throw new AppError(400, 'Validation failed.', [
      { field: 'status', message: `Status must be one of: ${STATUSES.join(', ')}.` }
    ]);
  }
  return list;
}

// A real calendar date in YYYY-MM-DD form. Date.parse alone is not enough:
// it silently turns 2026-02-31 into 3 March.
function isRealDate(value) {
  if (!DATE_REGEX.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Optional ?from= / ?to= dates (YYYY-MM-DD)
function parseDate(value, field) {
  if (!value) return null;
  if (!isRealDate(String(value))) {
    throw new AppError(400, 'Validation failed.', [
      { field, message: 'Use the date format YYYY-MM-DD.' }
    ]);
  }
  return String(value);
}

// Optional positive-integer query value such as ?zone_id=
function parseOptionalId(value, field) {
  if (value === undefined || value === '') return null;
  const id = toPositiveInt(value);
  if (!id) {
    throw new AppError(400, 'Validation failed.', [{ field, message: `${field} must be a positive number.` }]);
  }
  return id;
}

// Optional ?from=&to= pair; 'to' must not be before 'from'
function parseDateRange(query) {
  const from = parseDate(query.from, 'from');
  const to = parseDate(query.to, 'to');
  if (from && to && from > to) {
    throw new AppError(400, 'Validation failed.', [{ field: 'to', message: "'to' must not be before 'from'." }]);
  }
  return { from, to };
}

// Mandatory reason for reject / abort: 5–200 characters (fits the 255-char log note)
function parseReason(body) {
  const reason = cleanText(body && body.reason);
  if (reason.length < 5 || reason.length > 200) {
    throw new AppError(400, 'Validation failed.', [
      { field: 'reason', message: 'Reason is required (5 to 200 characters).' }
    ]);
  }
  return reason;
}

module.exports = {
  parseRequestId,
  parsePaging,
  parseStatusList,
  isRealDate,
  parseDate,
  parseDateRange,
  parseOptionalId,
  parseReason
};
