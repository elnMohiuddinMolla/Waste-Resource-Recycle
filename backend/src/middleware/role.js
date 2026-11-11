// ==============================================================================
// Waste Resource Recycle (WRR) - Role-Based Access Control (RBAC) Middleware
// Usage: router.get('/admin/users', authenticateToken, requireRole('admin'), handler)
// ==============================================================================

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Insufficient permissions for role: ${req.user.role}.`
      });
    }

    next();
  };
}

module.exports = {
  requireRole
};
