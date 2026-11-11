// ==============================================================================
// Waste Resource Recycle (WRR) - Report Service (FR-17, api-spec.md §8.10)
// ==============================================================================

const AppError = require('../utils/AppError');
const reportModel = require('../models/report.model');

// Report type in the URL → query. `uses` lists the filters each report applies.
const REPORTS = Object.freeze({
  'weight-by-category': { run: reportModel.weightByCategory, uses: ['dates', 'zone_id', 'category_id'] },
  'request-volume-by-status': { run: reportModel.requestVolumeByStatus, uses: ['dates', 'zone_id'] },
  'collector-performance': { run: reportModel.collectorPerformance, uses: ['dates', 'zone_id'] },
  'point-liability': { run: reportModel.pointLiability, uses: [] }, // all-time
  'redemption-summary': { run: reportModel.redemptionSummary, uses: ['dates'] }
});

const REPORT_TYPES = Object.keys(REPORTS);

// Today's date in Bangladesh time (+06:00) as YYYY-MM-DD
function bdToday() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Runs one report. Dates are whole days: default from = 1st of this month, to = today.
 * The response echoes only the filters this report actually uses.
 */
async function runReport(type, { from, to, zoneId, categoryId }) {
  const report = REPORTS[type];
  if (!report) {
    throw new AppError(404, `Unknown report '${type}'. Use one of: ${REPORT_TYPES.join(', ')}.`);
  }

  const today = bdToday();
  const fromDate = from || `${today.slice(0, 8)}01`;
  const toDate = to || today;
  if (fromDate > toDate) {
    throw new AppError(400, 'Validation failed.', [{ field: 'to', message: "'to' must not be before 'from'." }]);
  }

  const data = await report.run({
    from: `${fromDate} 00:00:00`,
    to: `${toDate} 23:59:59`,
    zoneId: report.uses.includes('zone_id') ? zoneId : null,
    categoryId: report.uses.includes('category_id') ? categoryId : null
  });

  const filters = {};
  if (report.uses.includes('dates')) Object.assign(filters, { from: fromDate, to: toDate });
  if (report.uses.includes('zone_id')) filters.zone_id = zoneId;
  if (report.uses.includes('category_id')) filters.category_id = categoryId;

  return { report_type: type, filters, data };
}

module.exports = {
  REPORT_TYPES,
  runReport
};
