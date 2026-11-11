// ==============================================================================
// Waste Resource Recycle (WRR) - Pickup Request Service (user side)
// FR-03 submit, FR-05 track, FR-06 cancel. Contract: api-spec.md Module 3.
// ==============================================================================

const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const pickupModel = require('../models/pickup.model');
const statusLogModel = require('../models/statusLog.model');
const categoryModel = require('../models/category.model');
const zoneModel = require('../models/zone.model');
const { assertTransition } = require('./requestStateMachine');
const { createNotification, NOTIFICATION_TYPES } = require('./notification.service');

/**
 * Creates a Pending request, its first status log and a confirmation notification,
 * all in one transaction. `data` was already shape-checked by the controller.
 */
async function createRequest(user, data) {
  const errors = [];

  const category = await categoryModel.findActiveById(data.categoryId);
  if (!category) {
    errors.push({ field: 'category_id', message: 'Select an active waste category.' });
  } else if (category.is_other && data.otherDescription.length < 5) {
    errors.push({ field: 'other_description', message: "Description is mandatory for 'Other' category (at least 5 characters)." });
  }

  if (!(await zoneModel.findActiveById(data.zoneId))) {
    errors.push({ field: 'zone_id', message: 'Select an active zone.' });
  }

  if (errors.length > 0) {
    throw new AppError(400, 'Validation failed.', errors);
  }

  const requestId = await withTransaction(async (conn) => {
    const id = await pickupModel.insert(conn, {
      userId: user.user_id,
      categoryId: data.categoryId,
      zoneId: data.zoneId,
      pickupAddress: data.pickupAddress,
      contactPhone: data.contactPhone,
      otherDescription: data.otherDescription || null,
      estimatedWeightKg: data.estimatedWeightKg,
      preferredAt: data.preferredAt
    });

    await statusLogModel.insert(conn, {
      requestId: id,
      changedById: user.user_id,
      oldStatus: null,
      newStatus: 'Pending',
      note: 'User submitted request'
    });

    await createNotification({
      connection: conn,
      userId: user.user_id,
      requestId: id,
      type: NOTIFICATION_TYPES.PICKUP_SUBMITTED,
      message: `Pickup request #${id} (${category.name}) submitted. We will assign a collector soon.`
    });

    return id;
  });

  return pickupModel.findById(requestId);
}

async function listMyRequests(user, { status, from, to, categoryId, page, limit }) {
  const { total, rows } = await pickupModel.listByUser(user.user_id, {
    status,
    from,
    to,
    categoryId,
    limit,
    offset: (page - 1) * limit
  });
  return { total, page, limit, requests: rows };
}

// Owner, the assigned collector and admins may view; everyone else gets 404
// (a 403 would tell them the request exists).
function canView(viewer, request) {
  if (viewer.role === 'admin') return true;
  if (viewer.role === 'user') return request.user_id === viewer.user_id;
  if (viewer.role === 'collector') return request.collector_id === viewer.user_id;
  return false;
}

async function getRequestDetails(viewer, requestId) {
  const r = await pickupModel.findDetails(requestId);
  if (!r || !canView(viewer, r)) {
    throw new AppError(404, `Pickup request #${requestId} not found.`);
  }

  const timeline = await statusLogModel.listForRequest(requestId);

  return {
    request_id: r.request_id,
    status: r.status,
    category_name: r.category_name,
    // Rate actually used once weighed; before that, the category's current rate
    points_per_kg: r.points_per_kg_applied || r.points_per_kg,
    zone_name: r.zone_name,
    pickup_address: r.pickup_address,
    contact_phone: r.contact_phone,
    other_description: r.other_description,
    estimated_weight_kg: r.estimated_weight_kg,
    actual_weight_kg: r.actual_weight_kg,
    points_earned: r.points_earned,
    preferred_at: r.preferred_at,
    created_at: r.created_at,
    user_name: r.user_name,
    collector: r.collector_id
      ? { collector_id: r.collector_id, name: r.collector_name, phone: r.collector_phone }
      : null,
    timeline
  };
}

// FR-06: the owner may cancel only while the request is Pending (transition T3)
async function cancelRequest(user, requestId) {
  return withTransaction(async (conn) => {
    const request = await pickupModel.findByIdForUpdate(conn, requestId);
    if (!request || request.user_id !== user.user_id) {
      throw new AppError(404, `Pickup request #${requestId} not found.`);
    }

    if (request.status !== 'Pending') {
      throw new AppError(409, `Cannot cancel request. Only Pending requests can be cancelled (current status: ${request.status}).`);
    }
    assertTransition(request.status, 'Cancelled', 'user');

    await pickupModel.updateStatus(conn, requestId, 'Cancelled');
    await statusLogModel.insert(conn, {
      requestId,
      changedById: user.user_id,
      oldStatus: request.status,
      newStatus: 'Cancelled',
      note: 'Cancelled by user'
    });

    return { request_id: requestId, status: 'Cancelled' };
  });
}

module.exports = {
  createRequest,
  listMyRequests,
  getRequestDetails,
  cancelRequest
};
