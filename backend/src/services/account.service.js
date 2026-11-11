// ==============================================================================
// Waste Resource Recycle (WRR) - Account Service
// FR-01 (self-registration), FR-20 (admin user & collector management).
// ==============================================================================

const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');
const userModel = require('../models/user.model');
const zoneModel = require('../models/zone.model');

const DUPLICATE_EMAIL = 'An account with this email already exists.';

// A real bcrypt hash (cost 10) that matches no password anyone uses. When the email
// is unknown we still run one bcrypt comparison against it, so the answer takes the
// same time as for a real account and nobody can tell which emails are registered.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DRe9yP5jUI.7zjAWyqP/QEiz0uvHi';

/**
 * Login check (FR-01). Returns the user, or throws 401 for a wrong email or password
 * (the same message for both) and 403 for a deactivated account.
 */
async function authenticate(email, password) {
  const user = await userModel.findByEmail(email);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'Invalid email or password.');
  if (user.status !== 'active') {
    throw new AppError(403, 'Your account has been deactivated. Please contact support.');
  }
  return user;
}

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

// Admin creates a collector; returns the admin view (with zone name and open_jobs)
async function createCollector(input) {
  const created = await createAccount(input, 'collector');
  return userModel.findAdminView(created.user_id);
}

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
  authenticate,
  createAccount,
  createCollector,
  listUsers,
  setStatus,
  setCollectorZone
};
