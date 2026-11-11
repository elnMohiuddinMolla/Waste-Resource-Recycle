// ==============================================================================
// Waste Resource Recycle (WRR) - Centralized Error Handling Middleware
// ==============================================================================

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body sent by the client
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body is not valid JSON.' });
  }

  const statusCode = err.statusCode || 500;

  // Unexpected errors: log them, but never send internals to the client
  if (statusCode === 500) {
    console.error('Unexpected error:', err);
  }

  const body = {
    success: false,
    message: statusCode === 500 ? 'An internal server error occurred.' : err.message
  };
  if (err.errors) body.errors = err.errors;
  if (statusCode === 500 && process.env.NODE_ENV === 'development') body.stack = err.stack;

  res.status(statusCode).json(body);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
