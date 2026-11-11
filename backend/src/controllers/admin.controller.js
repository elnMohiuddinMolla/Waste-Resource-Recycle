// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Controller
// Request queue and collector assignment (api-spec.md §8.1, §8.2).
// ==============================================================================

const AppError = require('../utils/AppError');
const assignmentService = require('../services/assignment.service');
const { toPositiveInt } = require('../utils/validators');
const { parseRequestId, parsePaging, parseStatusList, parseOptionalId } = require('./common');

async function listPickupRequests(req, res, next) {
  try {
    const statuses = parseStatusList(req.query.status, null);
    if (statuses && statuses.length > 1) {
      throw new AppError(400, 'Validation failed.', [{ field: 'status', message: 'Filter by one status at a time.' }]);
    }
    const zoneId = parseOptionalId(req.query.zone_id, 'zone_id');
    const { page, limit } = parsePaging(req.query, 20);

    const data = await assignmentService.listRequests({
      status: statuses ? statuses[0] : null,
      zoneId,
      page,
      limit
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function assignCollector(req, res, next) {
  try {
    const requestId = parseRequestId(req);
    const collectorId = toPositiveInt(req.body && req.body.collector_id);
    if (!collectorId) {
      throw new AppError(400, 'Validation failed.', [{ field: 'collector_id', message: 'Select a collector.' }]);
    }
    const data = await assignmentService.assignCollector(req.user, requestId, collectorId);
    res.json({ success: true, message: 'Collector assigned successfully.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPickupRequests,
  assignCollector
};
