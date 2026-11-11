// ==============================================================================
// Waste Resource Recycle (WRR) - JWT Cookie Authentication Middleware
// The JWT lives only in the HttpOnly cookie "token" (api-spec.md §1.1).
// ==============================================================================

const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');

async function authenticateToken(req, res, next) {
  const token = req.cookies && req.cookies.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.'
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.name === 'TokenExpiredError'
        ? 'Session expired. Please log in again.'
        : 'Authentication required. Please log in.'
    });
  }

  try {
    // Re-read the account on every request so deactivation and role changes apply at once (FR-02)
    const user = await userModel.findById(decoded.user_id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  authenticateToken
};
