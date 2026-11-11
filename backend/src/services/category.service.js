// ==============================================================================
// Waste Resource Recycle (WRR) - Category Governance Service (admin)
// FR-04, FR-16 (catalog part), PRD §5.2. Contract: api-spec.md §8.6.
//
// Changing points_per_kg never changes past rewards: every collection record keeps
// its own copy (points_per_kg_applied) taken when the waste was weighed.
// ==============================================================================

const AppError = require('../utils/AppError');
const categoryModel = require('../models/category.model');

function duplicateName(name) {
  return new AppError(409, `A category named '${name}' already exists.`);
}

async function listAll() {
  return categoryModel.listAll();
}

async function createCategory({ name, pointsPerKg, isOther }) {
  if (await categoryModel.findByName(name)) throw duplicateName(name);
  try {
    const id = await categoryModel.insert({ name, pointsPerKg, isOther });
    return categoryModel.findById(id);
  } catch (err) {
    // Two admins creating the same name at the same moment
    if (err.code === 'ER_DUP_ENTRY') throw duplicateName(name);
    throw err;
  }
}

async function updateCategory(categoryId, changes) {
  const current = await categoryModel.findById(categoryId);
  if (!current) throw new AppError(404, `Category #${categoryId} not found.`);

  if (changes.name !== undefined) {
    const other = await categoryModel.findByName(changes.name);
    if (other && other.category_id !== categoryId) throw duplicateName(changes.name);
  }

  try {
    await categoryModel.update(categoryId, changes);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw duplicateName(changes.name);
    throw err;
  }
  return categoryModel.findById(categoryId);
}

module.exports = {
  listAll,
  createCategory,
  updateCategory
};
