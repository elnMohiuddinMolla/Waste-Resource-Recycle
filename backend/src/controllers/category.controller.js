// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Category Controller (api-spec.md §8.6)
// ==============================================================================

const AppError = require('../utils/AppError');
const categoryService = require('../services/category.service');
const { toPositiveInt, toNonNegativeAmount, toBoolean, cleanText } = require('../utils/validators');

const NAME_MESSAGE = 'Name must be 2 to 100 characters.';
const RATE_MESSAGE = 'Points per kg must be a number from 0 to 99999999.99.';

function parseCategoryId(req) {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new AppError(404, `Category #${req.params.id} not found.`);
  return id;
}

function validName(name) {
  return name.length >= 2 && name.length <= 100;
}

async function list(req, res, next) {
  try {
    res.json({ success: true, data: await categoryService.listAll() });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];

    const name = cleanText(body.name);
    const pointsPerKg = toNonNegativeAmount(body.points_per_kg);
    const isOther = body.is_other === undefined ? false : toBoolean(body.is_other);

    if (!validName(name)) errors.push({ field: 'name', message: NAME_MESSAGE });
    if (pointsPerKg === null) errors.push({ field: 'points_per_kg', message: RATE_MESSAGE });
    if (isOther === null) errors.push({ field: 'is_other', message: 'is_other must be true or false.' });
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await categoryService.createCategory({ name, pointsPerKg, isOther });
    res.status(201).json({ success: true, message: 'Category created.', data });
  } catch (err) {
    next(err);
  }
}

// Partial update: send any of name, points_per_kg, is_active
async function update(req, res, next) {
  try {
    const id = parseCategoryId(req);
    const body = req.body || {};
    const errors = [];
    const changes = {};

    if (body.name !== undefined) {
      changes.name = cleanText(body.name);
      if (!validName(changes.name)) errors.push({ field: 'name', message: NAME_MESSAGE });
    }
    if (body.points_per_kg !== undefined) {
      changes.pointsPerKg = toNonNegativeAmount(body.points_per_kg);
      if (changes.pointsPerKg === null) errors.push({ field: 'points_per_kg', message: RATE_MESSAGE });
    }
    if (body.is_active !== undefined) {
      changes.isActive = toBoolean(body.is_active);
      if (changes.isActive === null) errors.push({ field: 'is_active', message: 'is_active must be true or false.' });
    }
    if (Object.keys(changes).length === 0) {
      errors.push({ field: 'body', message: 'Send at least one of name, points_per_kg, is_active.' });
    }
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await categoryService.updateCategory(id, changes);
    res.json({ success: true, message: 'Category updated.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  create,
  update
};
