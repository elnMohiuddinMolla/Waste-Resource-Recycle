// ==============================================================================
// Waste Resource Recycle (WRR) - Zone Governance Service (admin)
// FR-19. Contract: api-spec.md §8.7.
// Zones are never deleted (foreign keys are RESTRICT); deactivate them instead.
// A deactivated zone can't be chosen for new registrations or requests, but
// existing users and requests keep it.
// ==============================================================================

const AppError = require('../utils/AppError');
const zoneModel = require('../models/zone.model');

function duplicateName(name) {
  return new AppError(409, `A zone named '${name}' already exists.`);
}

async function listAll() {
  return zoneModel.listAll();
}

// Used by form validation: can this zone be chosen for a new account or request?
async function isActiveZone(zoneId) {
  return Boolean(await zoneModel.findActiveById(zoneId));
}

async function createZone({ name, description }) {
  if (await zoneModel.findByName(name)) throw duplicateName(name);
  try {
    const id = await zoneModel.insert({ name, description });
    return zoneModel.findById(id);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw duplicateName(name); // two admins at the same moment
    throw err;
  }
}

async function updateZone(zoneId, changes) {
  const current = await zoneModel.findById(zoneId);
  if (!current) throw new AppError(404, `Zone #${zoneId} not found.`);

  if (changes.name !== undefined) {
    const other = await zoneModel.findByName(changes.name);
    if (other && other.zone_id !== zoneId) throw duplicateName(changes.name);
  }

  try {
    await zoneModel.update(zoneId, changes);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw duplicateName(changes.name);
    throw err;
  }
  return zoneModel.findById(zoneId);
}

module.exports = {
  listAll,
  isActiveZone,
  createZone,
  updateZone
};
