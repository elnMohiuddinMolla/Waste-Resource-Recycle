// ==============================================================================
// Waste Resource Recycle (WRR) - Pickup Request Controller (user side)
// Checks the shape of the input, then calls pickup.service.
// ==============================================================================

const AppError = require('../utils/AppError');
const pickupService = require('../services/pickup.service');
const {
  parseRequestId, parsePaging, parseStatusList, parseDateRange, parseOptionalId
} = require('./common');
const {
  isValidPhone, toPositiveInt, toPositiveAmount, cleanText, parseBdDateTime
} = require('../utils/validators');

async function create(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];

    const categoryId = toPositiveInt(body.category_id);
    const zoneId = toPositiveInt(body.zone_id);
    const pickupAddress = cleanText(body.pickup_address);
    const contactPhone = cleanText(body.contact_phone);
    const otherDescription = cleanText(body.other_description);
    const estimatedWeightKg = toPositiveAmount(body.estimated_weight_kg);
    const preferred = parseBdDateTime(body.preferred_at);

    if (!categoryId) errors.push({ field: 'category_id', message: 'Select a waste category.' });
    if (!zoneId) errors.push({ field: 'zone_id', message: 'Select a zone.' });
    if (!pickupAddress || pickupAddress.length > 255) {
      errors.push({ field: 'pickup_address', message: 'Pickup address is required (max 255 characters).' });
    }
    if (!isValidPhone(contactPhone)) {
      errors.push({ field: 'contact_phone', message: 'Enter a valid Bangladeshi mobile number (e.g. 01711000000).' });
    }
    if (!estimatedWeightKg) {
      errors.push({ field: 'estimated_weight_kg', message: 'Estimated weight must be greater than 0 kg.' });
    }
    if (!preferred) {
      errors.push({ field: 'preferred_at', message: 'Enter the preferred date and time (YYYY-MM-DDTHH:mm).' });
    } else if (preferred.date.getTime() <= Date.now()) {
      errors.push({ field: 'preferred_at', message: 'Preferred date must be in the future.' });
    }
    if (otherDescription.length > 1000) {
      errors.push({ field: 'other_description', message: 'Description must be at most 1000 characters.' });
    }

    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const created = await pickupService.createRequest(req.user, {
      categoryId,
      zoneId,
      pickupAddress,
      contactPhone,
      otherDescription,
      estimatedWeightKg,
      preferredAt: preferred.sql
    });

    res.status(201).json({
      success: true,
      message: 'Pickup request submitted successfully.',
      data: created
    });
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    const statuses = parseStatusList(req.query.status, null);
    if (statuses && statuses.length > 1) {
      throw new AppError(400, 'Validation failed.', [{ field: 'status', message: 'Filter by one status at a time.' }]);
    }
    const status = statuses ? statuses[0] : null;
    const { from, to } = parseDateRange(req.query);
    const categoryId = parseOptionalId(req.query.category_id, 'category_id');
    const { page, limit } = parsePaging(req.query);

    const data = await pickupService.listMyRequests(req.user, { status, from, to, categoryId, page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const data = await pickupService.getRequestDetails(req.user, parseRequestId(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const data = await pickupService.cancelRequest(req.user, parseRequestId(req));
    res.json({ success: true, message: 'Pickup request cancelled successfully.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  listMine,
  getOne,
  cancel
};
