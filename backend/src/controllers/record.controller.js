// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Collection Record Controller (api-spec.md §8.5)
// ==============================================================================

const AppError = require('../utils/AppError');
const recordService = require('../services/record.service');
const { toPositiveInt, toPositiveAmount, cleanText } = require('../utils/validators');
const { parsePaging, parseDateRange, parseOptionalId } = require('./common');

async function list(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const zoneId = parseOptionalId(req.query.zone_id, 'zone_id');
    const { page, limit } = parsePaging(req.query, 20);
    const data = await recordService.listRecords({ from, to, zoneId, page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function correctWeight(req, res, next) {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) throw new AppError(404, `Collection record #${req.params.id} not found.`);

    const body = req.body || {};
    const errors = [];
    const actualWeightKg = toPositiveAmount(body.actual_weight_kg);
    const remarks = cleanText(body.remarks);

    if (!actualWeightKg) errors.push({ field: 'actual_weight_kg', message: 'Actual weight must be greater than 0 kg.' });
    if (remarks.length > 1000) errors.push({ field: 'remarks', message: 'Remarks must be at most 1000 characters.' });
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await recordService.correctWeight(req.user, id, { actualWeightKg, remarks });
    res.json({ success: true, message: 'Weight corrected and ledger balance adjusted successfully.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  correctWeight
};
