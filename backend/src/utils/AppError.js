// ==============================================================================
// Waste Resource Recycle (WRR) - Application Error
// Throw this from services/controllers; the error middleware turns it into the
// standard JSON error envelope (api-spec.md §1.2).
// ==============================================================================

class AppError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors; // optional [{ field, message }]
  }
}

module.exports = AppError;
