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

// Optional ?from= / ?to= dates (YYYY-MM-DD)
function parseDate(value, field) {
  if (!value) return null;
  if (!DATE_REGEX.test(String(value)) || Number.isNaN(Date.parse(value))) {
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
  parseDate,
  parseOptionalId,
  parseReason
};
