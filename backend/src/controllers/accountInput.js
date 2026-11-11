// ==============================================================================
// Waste Resource Recycle (WRR) - Account form validation
// Shared by self-registration (POST /auth/register) and collector creation
// (POST /admin/collectors), so both follow exactly the same rules (api-spec §1.1).
// ==============================================================================

const AppError = require('../utils/AppError');
const zoneModel = require('../models/zone.model');
const { isValidEmail, isValidPhone, toPositiveInt, cleanText } = require('../utils/validators');

/**
 * Checks the account fields and returns clean values, or throws 400 with one
 * error per bad field. The zone must exist and be active.
 */
async function parseAccountInput(body) {
  const b = body || {};
  const errors = [];

  const fullName = cleanText(b.full_name);
  const email = cleanText(b.email).toLowerCase();
  const phone = cleanText(b.phone);
  const password = typeof b.password === 'string' ? b.password : '';
  const address = cleanText(b.address) || null;
  const zoneId = toPositiveInt(b.zone_id);

  if (fullName.length < 3 || fullName.length > 100) {
    errors.push({ field: 'full_name', message: 'Full name must be 3 to 100 characters.' });
  }
  if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'Enter a valid email address.' });
  }
  if (!isValidPhone(phone)) {
    errors.push({ field: 'phone', message: 'Enter a valid Bangladeshi mobile number (e.g. 01711000000).' });
  }
  if (password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters.' });
  }
  if (address && address.length > 255) {
    errors.push({ field: 'address', message: 'Address must be at most 255 characters.' });
  }
  if (!zoneId || !(await zoneModel.findActiveById(zoneId))) {
    errors.push({ field: 'zone_id', message: 'Select an active zone.' });
  }

  if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);
  return { fullName, email, phone, password, address, zoneId };
}

module.exports = {
  parseAccountInput
};
