// ==============================================================================
// Waste Resource Recycle (WRR) - Authentication Controller
// Contract: api-spec.md Module 1
// ==============================================================================

const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const accountService = require('../services/account.service');
const { parseAccountInput } = require('./accountInput');

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
    const input = await parseAccountInput(req.body);
    // Self-registration always creates a General User
    const user = await accountService.createAccount(input, 'user');
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

    // 401 for unknown email or wrong password (same message and same time), 403 if inactive
    const user = await accountService.authenticate(email.trim().toLowerCase(), password);

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
