// ==============================================================================
// Waste Resource Recycle (WRR) - Admin Zone Controller (api-spec.md §8.7)
// ==============================================================================

const AppError = require('../utils/AppError');
const zoneService = require('../services/zone.service');
const { toPositiveInt, toBoolean, cleanText } = require('../utils/validators');

const NAME_MESSAGE = 'Name must be 2 to 100 characters.';
const DESCRIPTION_MESSAGE = 'Description must be at most 1000 characters.';

function parseZoneId(req) {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new AppError(404, `Zone #${req.params.id} not found.`);
  return id;
}

function validName(name) {
  return name.length >= 2 && name.length <= 100;
}

// Optional text: missing, null or '' are stored as NULL
function parseDescription(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined; // invalid
  const text = value.trim();
  return text === '' ? null : text;
}

async function list(req, res, next) {
  try {
    res.json({ success: true, data: await zoneService.listAll() });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];

    const name = cleanText(body.name);
    const description = parseDescription(body.description);

    if (!validName(name)) errors.push({ field: 'name', message: NAME_MESSAGE });
    if (description === undefined || (description && description.length > 1000)) {
      errors.push({ field: 'description', message: DESCRIPTION_MESSAGE });
    }
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await zoneService.createZone({ name, description });
    res.status(201).json({ success: true, message: 'Zone created.', data });
  } catch (err) {
    next(err);
  }
}

// Partial update: send any of name, description, is_active
async function update(req, res, next) {
  try {
    const id = parseZoneId(req);
    const body = req.body || {};
    const errors = [];
    const changes = {};

    if (body.name !== undefined) {
      changes.name = cleanText(body.name);
      if (!validName(changes.name)) errors.push({ field: 'name', message: NAME_MESSAGE });
    }
    if ('description' in body) {
      changes.description = parseDescription(body.description);
      if (changes.description === undefined || (changes.description && changes.description.length > 1000)) {
        errors.push({ field: 'description', message: DESCRIPTION_MESSAGE });
      }
    }
    if (body.is_active !== undefined) {
      changes.isActive = toBoolean(body.is_active);
      if (changes.isActive === null) errors.push({ field: 'is_active', message: 'is_active must be true or false.' });
    }
    if (Object.keys(changes).length === 0) {
      errors.push({ field: 'body', message: 'Send at least one of name, description, is_active.' });
    }
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await zoneService.updateZone(id, changes);
    res.json({ success: true, message: 'Zone updated.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  create,
  update
};
