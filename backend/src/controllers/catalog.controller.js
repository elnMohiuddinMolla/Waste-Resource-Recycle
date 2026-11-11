// ==============================================================================
// Waste Resource Recycle (WRR) - Public Catalog Controller (api-spec.md Module 2)
// ==============================================================================

const catalogService = require('../services/catalog.service');

async function listCategories(req, res, next) {
  try {
    res.json({ success: true, data: await catalogService.listActiveCategories() });
  } catch (err) {
    next(err);
  }
}

async function listZones(req, res, next) {
  try {
    res.json({ success: true, data: await catalogService.listActiveZones() });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories,
  listZones
};
