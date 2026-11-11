// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Redemption Rule Controller (api-spec.md §8.8)
// ==============================================================================

const AppError = require('../utils/AppError');
const ruleService = require('../services/rule.service');
const { toNonNegativeAmount } = require('../utils/validators');

// taka_per_point is DECIMAL(10,4): more than 0, at most 4 decimals, below 1,000,000
const RATE_REGEX = /^\d{1,6}(\.\d{1,4})?$/;

function parseTakaPerPoint(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!RATE_REGEX.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

async function list(req, res, next) {
  try {
    res.json({ success: true, data: await ruleService.listRules() });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];

    const takaPerPoint = parseTakaPerPoint(body.taka_per_point);
    const minPoints = toNonNegativeAmount(body.min_points);

    if (takaPerPoint === null) {
      errors.push({ field: 'taka_per_point', message: 'Taka per point must be more than 0, with at most 4 decimals.' });
    }
    if (minPoints === null) {
      errors.push({ field: 'min_points', message: 'Minimum points must be a number from 0 to 99999999.99.' });
    }
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await ruleService.createRule(req.user, { takaPerPoint, minPoints });
    res.status(201).json({ success: true, message: 'New redemption tariff rule activated.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  create
};
