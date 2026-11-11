// ==============================================================================
// Waste Resource Recycle (WRR) - Collector Workflow Service
// FR-08 accept / reject / abort, FR-09 weigh, FR-10 complete + EARN, FR-12 history.
// Contract: api-spec.md Module 4.
// ==============================================================================

const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const pickupModel = require('../models/pickup.model');
const statusLogModel = require('../models/statusLog.model');
const collectionModel = require('../models/collection.model');
const ledgerModel = require('../models/ledger.model');
const { assertTransition } = require('./requestStateMachine');
const { createNotification, NOTIFICATION_TYPES } = require('./notification.service');

/**
 * Locks the request and checks it belongs to this collector.
 * Someone else's job gives 404 (same as a job that does not exist).
 */
async function lockOwnRequest(conn, collector, requestId) {
  const request = await pickupModel.findByIdForUpdate(conn, requestId);
  if (!request || request.collector_id !== collector.user_id) {
    throw new AppError(404, `Pickup request #${requestId} not found.`);
  }
  return request;
}

// Status change + log + user notification: the common part of accept / reject / abort
async function changeStatus(conn, { collector, request, to, note, type, message }) {
  assertTransition(request.status, to, 'collector');

  if (to === 'Rejected') {
    await pickupModel.markRejected(conn, request.request_id); // also clears collector_id
  } else {
    await pickupModel.updateStatus(conn, request.request_id, to);
  }

  await statusLogModel.insert(conn, {
    requestId: request.request_id,
    changedById: collector.user_id,
    oldStatus: request.status,
    newStatus: to,
    note
  });
  await createNotification({
    connection: conn,
    userId: request.user_id,
    requestId: request.request_id,
    type,
    message
  });

  return { request_id: request.request_id, status: to };
}

async function listMyJobs(collector, { statuses, zoneId }) {
  return pickupModel.listForCollector(collector.user_id, { statuses, zoneId });
}

// T4
async function acceptRequest(collector, requestId) {
  return withTransaction(async (conn) => {
    const request = await lockOwnRequest(conn, collector, requestId);
    return changeStatus(conn, {
      collector,
      request,
      to: 'Accepted',
      note: 'Accepted by collector',
      type: NOTIFICATION_TYPES.PICKUP_ACCEPTED,
      message: `Your pickup #${requestId} was accepted by ${collector.full_name}. The collector will come at your preferred time.`
    });
  });
}

// T5: back to the admin queue
async function rejectRequest(collector, requestId, reason) {
  return withTransaction(async (conn) => {
    const request = await lockOwnRequest(conn, collector, requestId);
    return changeStatus(conn, {
      collector,
      request,
      to: 'Rejected',
      note: reason,
      type: NOTIFICATION_TYPES.PICKUP_REJECTED,
      message: `The collector could not take pickup #${requestId}. We are assigning another collector.`
    });
  });
}

// T7: on-site abort
async function abortRequest(collector, requestId, reason) {
  return withTransaction(async (conn) => {
    const request = await lockOwnRequest(conn, collector, requestId);
    return changeStatus(conn, {
      collector,
      request,
      to: 'Cancelled',
      note: reason,
      type: NOTIFICATION_TYPES.PICKUP_ABORTED,
      message: `Pickup #${requestId} was cancelled on site. Reason: ${reason}`
    });
  });
}

// T6: weigh on site; snapshot the category rate into the collection record
async function recordWeight(collector, requestId, actualWeightKg, remarks) {
  return withTransaction(async (conn) => {
    const request = await lockOwnRequest(conn, collector, requestId);
    assertTransition(request.status, 'Collected', 'collector');

    const recordId = await collectionModel.insert(conn, {
      requestId,
      collectorId: collector.user_id,
      categoryId: request.category_id,
      actualWeightKg,
      remarks: remarks || null
    });
    await pickupModel.updateStatus(conn, requestId, 'Collected');
    await statusLogModel.insert(conn, {
      requestId,
      changedById: collector.user_id,
      oldStatus: request.status,
      newStatus: 'Collected',
      note: `Weighed ${actualWeightKg} kg on scale`
    });

    const record = await collectionModel.findByRequestId(conn, requestId);
    await createNotification({
      connection: conn,
      userId: request.user_id,
      requestId,
      type: NOTIFICATION_TYPES.PICKUP_COLLECTED,
      message: `Pickup #${requestId}: ${record.actual_weight_kg} kg of ${request.category_name} weighed (${record.calculated_points} points on completion).`
    });

    return {
      record_id: recordId,
      request_id: requestId,
      actual_weight_kg: record.actual_weight_kg,
      points_per_kg_applied: record.points_per_kg_applied,
      calculated_points: record.calculated_points,
      status: 'Collected'
    };
  });
}

// T8: complete and credit the user's points, all in one transaction (FR-10)
async function completeRequest(collector, requestId) {
  return withTransaction(async (conn) => {
    const request = await lockOwnRequest(conn, collector, requestId);
    assertTransition(request.status, 'Completed', 'collector');

    const record = await collectionModel.findByRequestId(conn, requestId);
    if (!record) {
      // Cannot happen if T6 ran, but never credit points without a weighing record
      throw new AppError(409, `Pickup request #${requestId} has no collection record.`);
    }

    await pickupModel.updateStatus(conn, requestId, 'Completed');
    await collectionModel.markCompleted(conn, record.record_id);
    const points = await ledgerModel.insertEarn(conn, { userId: request.user_id, recordId: record.record_id });

    await statusLogModel.insert(conn, {
      requestId,
      changedById: collector.user_id,
      oldStatus: request.status,
      newStatus: 'Completed',
      note: 'Collection completed and reward points posted'
    });
    await createNotification({
      connection: conn,
      userId: request.user_id,
      requestId,
      type: NOTIFICATION_TYPES.PICKUP_COMPLETED,
      message: `Pickup #${requestId} completed! ${record.actual_weight_kg} kg ${request.category_name} earned you ${points} points.`
    });

    return { request_id: requestId, status: 'Completed', points_credited: points };
  });
}

async function history(collector, { from, to, categoryId, page, limit }) {
  const data = await collectionModel.listCompletedByCollector(collector.user_id, {
    from,
    to,
    categoryId,
    limit,
    offset: (page - 1) * limit
  });
  return { ...data, page, limit };
}

module.exports = {
  listMyJobs,
  acceptRequest,
  rejectRequest,
  abortRequest,
  recordWeight,
  completeRequest,
  history
};
