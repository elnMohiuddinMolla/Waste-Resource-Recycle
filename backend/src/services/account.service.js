// ==============================================================================
// Waste Resource Recycle (WRR) - Account Service
// FR-01 (self-registration), FR-20 (admin user & collector management).
// ==============================================================================

const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const userModel = require('../models/user.model');
const zoneModel = require('../models/zone.model');

const DUPLICATE_EMAIL = 'An account with this email already exists.';

/**
 * Creates an account with the given role ('user' for registration,
 * 'collector' when an admin creates one). Input was checked by parseAccountInput.
 */
async function createAccount({ fullName, email, phone, password, address, zoneId }, role) {
  if (await userModel.findByEmail(email)) throw new AppError(409, DUPLICATE_EMAIL);

  const passwordHash = await bcrypt.hash(password, 10);
  let userId;
  try {
    userId = await userModel.createUser({ fullName, email, phone, passwordHash, role, address, zoneId });
  } catch (err) {
    // Two sign-ups with the same email at the same moment
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, DUPLICATE_EMAIL);
    throw err;
  }
  return userModel.findById(userId);
}

// ---------- Admin (FR-20) ----------

async function listUsers(filters) {
  const { total, rows } = await userModel.listForAdmin({
    ...filters,
    offset: (filters.page - 1) * filters.limit
  });
  return { total, page: filters.page, limit: filters.limit, users: rows };
}

async function getAdminViewOr404(userId) {
  const user = await userModel.findAdminView(userId);
  if (!user) throw new AppError(404, `User #${userId} not found.`);
  return user;
}

/**
 * Activate or deactivate an account. A deactivated user is blocked on their next
 * request (auth middleware re-reads the status). A collector with open jobs may be
 * deactivated; the response shows open_jobs so the admin reassigns them
 * (automatic reassignment is future work, requirement-validation MF-02).
 */
async function setStatus(admin, userId, status) {
  await getAdminViewOr404(userId);
  if (userId === admin.user_id && status === 'inactive') {
    throw new AppError(409, 'You cannot deactivate your own account.');
  }
  await userModel.updateStatus(userId, status);
  return userModel.findAdminView(userId);
}

// Only collectors have an operating zone that the admin manages
async function setCollectorZone(userId, zoneId) {
  const user = await getAdminViewOr404(userId);
  if (user.role !== 'collector') {
    throw new AppError(409, 'Only a collector\'s zone can be changed here.');
  }
  if (!(await zoneModel.findActiveById(zoneId))) {
    throw new AppError(400, 'Validation failed.', [{ field: 'zone_id', message: 'Select an active zone.' }]);
  }
  await userModel.updateZone(userId, zoneId);
  return userModel.findAdminView(userId);
}

module.exports = {
  createAccount,
  listUsers,
  setStatus,
  setCollectorZone
};
