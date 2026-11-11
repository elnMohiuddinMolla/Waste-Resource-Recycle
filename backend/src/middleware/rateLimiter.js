// ==============================================================================
// Waste Resource Recycle (WRR) - Rate Limiters
// NFR-03: 5 failed login attempts per 15 minutes per IP, then HTTP 429.
// ==============================================================================

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // only failed logins (status >= 400) count
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many failed login attempts. Please try again in 15 minutes.'
  }
});

module.exports = {
  loginLimiter
};
