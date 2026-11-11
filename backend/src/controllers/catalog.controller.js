// ==============================================================================
// Waste Resource Recycle (WRR) - Public Catalog Controller (api-spec.md Module 2)
// ==============================================================================

const categoryModel = require('../models/category.model');
const zoneModel = require('../models/zone.model');

async function listCategories(req, res, next) {
  try {
    res.json({ success: true, data: await categoryModel.listActive() });
  } catch (err) {
    next(err);
  }
}

async function listZones(req, res, next) {
  try {
    res.json({ success: true, data: await zoneModel.listActive() });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories,
  listZones
};
