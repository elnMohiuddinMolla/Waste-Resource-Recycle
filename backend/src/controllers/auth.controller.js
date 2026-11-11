// ==============================================================================
// Waste Resource Recycle (WRR) - Authentication Controller
// Contract: api-spec.md Module 1
// ==============================================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const zoneModel = require('../models/zone.model');
const AppError = require('../utils/AppError');
const { isValidEmail, isValidPhone } = require('../utils/validators');

const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production', // HTTPS only in deployment
  path: '/'
};

// Only fields that are safe to send to the browser (never password_hash)
function publicUser(user) {
  return {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    address: user.address,
    zone_id: user.zone_id,
    status: user.status
  };
}

async function register(req, res, next) {
  try {
    const { full_name, email, phone, password, address, zone_id } = req.body || {};
    const errors = [];

    const name = typeof full_name === 'string' ? full_name.trim() : '';
    const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const tel = typeof phone === 'string' ? phone.trim() : '';
    const addr = typeof address === 'string' && address.trim() ? address.trim() : null;
    const zoneId = Number.parseInt(zone_id, 10);

    if (name.length < 3 || name.length > 100) {
      errors.push({ field: 'full_name', message: 'Full name must be 3 to 100 characters.' });
    }
    if (!isValidEmail(mail)) {
      errors.push({ field: 'email', message: 'Enter a valid email address.' });
    }
    if (!isValidPhone(tel)) {
      errors.push({ field: 'phone', message: 'Enter a valid Bangladeshi mobile number (e.g. 01711000000).' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      errors.push({ field: 'password', message: 'Password must be at least 8 characters.' });
    }
    if (addr && addr.length > 255) {
      errors.push({ field: 'address', message: 'Address must be at most 255 characters.' });
    }
    if (Number.isNaN(zoneId) || !(await zoneModel.findActiveById(zoneId))) {
      errors.push({ field: 'zone_id', message: 'Select an active zone.' });
    }

    if (errors.length > 0) {
      throw new AppError(400, 'Validation failed.', errors);
    }

    if (await userModel.findByEmail(mail)) {
      throw new AppError(409, 'An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let userId;
    try {
      userId = await userModel.createUser({
        fullName: name,
        email: mail,
        phone: tel,
        passwordHash,
        role: 'user', // self-registration always creates a General User
        address: addr,
        zoneId
      });
    } catch (err) {
      // Two sign-ups with the same email at the same moment
      if (err.code === 'ER_DUP_ENTRY') {
        throw new AppError(409, 'An account with this email already exists.');
      }
      throw err;
    }

    const user = await userModel.findById(userId);
    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      throw new AppError(400, 'Validation failed.', [
        { field: 'email', message: 'Email and password are required.' }
      ]);
    }

    const user = await userModel.findByEmail(email.trim().toLowerCase());

    // Same message for unknown email and wrong password, so emails can't be probed
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError(401, 'Invalid email or password.');
    }

    if (user.status !== 'active') {
      throw new AppError(403, 'Your account has been deactivated. Please contact support.');
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // The token goes only into the HttpOnly cookie, never into the response body
    res.cookie('token', token, { ...cookieOptions, maxAge: TOKEN_MAX_AGE_MS });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: { user: publicUser(user) }
    });
  } catch (error) {
    next(error);
  }
}

function logout(req, res) {
  res.clearCookie('token', cookieOptions);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
}

function getProfile(req, res) {
  // req.user is loaded fresh from the database by authenticateToken
  res.status(200).json({
    success: true,
    data: { ...publicUser(req.user), zone_name: req.user.zone_name }
  });
}

module.exports = {
  register,
  login,
  logout,
  getProfile
};
