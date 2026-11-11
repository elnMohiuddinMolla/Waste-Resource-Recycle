// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Report Controller (api-spec.md §8.10)
// ==============================================================================

const reportService = require('../services/report.service');
const { parseDateRange, parseOptionalId } = require('./common');

async function getReport(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const zoneId = parseOptionalId(req.query.zone_id, 'zone_id');
    const categoryId = parseOptionalId(req.query.category_id, 'category_id');

    const result = await reportService.runReport(req.params.type, { from, to, zoneId, categoryId });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getReport
};
