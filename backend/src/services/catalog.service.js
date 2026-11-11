// ==============================================================================
// Waste Resource Recycle (WRR) - Public Catalog Service (FR-04, api-spec.md Module 2)
// Only active categories and zones are offered in the registration and request forms.
// ==============================================================================

const categoryModel = require('../models/category.model');
const zoneModel = require('../models/zone.model');

async function listActiveCategories() {
  return categoryModel.listActive();
}

async function listActiveZones() {
  return zoneModel.listActive();
}

module.exports = {
  listActiveCategories,
  listActiveZones
};
