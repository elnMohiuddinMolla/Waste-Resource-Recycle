// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Assignment Service
// FR-07: admin assigns a collector to a Pending or Rejected request (T1, T2).
// Contract: api-spec.md §8.1, §8.2.
// ==============================================================================

const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const pickupModel = require('../models/pickup.model');
const statusLogModel = require('../models/statusLog.model');
const userModel = require('../models/user.model');
const { assertTransition } = require('./requestStateMachine');
const { createNotification, NOTIFICATION_TYPES } = require('./notification.service');

async function listRequests({ status, zoneId, page, limit }) {
  const { total, rows } = await pickupModel.listForAdmin({
    status,
    zoneId,
    limit,
    offset: (page - 1) * limit
  });
  return { total, page, limit, requests: rows };
}

async function assignCollector(admin, requestId, collectorId) {
  return withTransaction(async (conn) => {
    const request = await pickupModel.findByIdForUpdate(conn, requestId);
    if (!request) {
      throw new AppError(404, `Pickup request #${requestId} not found.`);
    }

    // T1 (Pending) or T2 (Rejected); anything else is 409
    assertTransition(request.status, 'Assigned', 'admin');

    const collector = await userModel.findActiveCollector(conn, collectorId);
    if (!collector) {
      throw new AppError(400, 'Validation failed.', [
        { field: 'collector_id', message: 'Select an active collector.' }
      ]);
    }

    await pickupModel.assignCollector(conn, requestId, collectorId);
    await statusLogModel.insert(conn, {
      requestId,
      changedById: admin.user_id,
      oldStatus: request.status,
      newStatus: 'Assigned',
      note: request.status === 'Rejected'
        ? `Reassigned to ${collector.full_name}`
        : `Assigned to ${collector.full_name}`
    });
    await createNotification({
      connection: conn,
      userId: collectorId,
      requestId,
      type: NOTIFICATION_TYPES.PICKUP_ASSIGNED,
      message: `New pickup job #${requestId} (${request.category_name}) has been assigned to you.`
    });

    return { request_id: requestId, collector_id: collectorId, status: 'Assigned' };
  });
}

module.exports = {
  listRequests,
  assignCollector
};
