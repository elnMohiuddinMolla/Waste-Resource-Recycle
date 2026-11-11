// ==============================================================================
// Waste Resource Recycle (WRR) - Express Application Entry Point
// One server serves the REST API (/api/v1) and the static frontend (same origin).
// ==============================================================================

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { testConnection } = require('./config/db'); // also loads .env
const { notFoundHandler, errorHandler } = require('./middleware/error');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and set it.');
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use(cookieParser());

// ---------- REST API ----------
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1', require('./routes/catalog.routes'));            // /categories, /zones
app.use('/api/v1/pickup-requests', require('./routes/pickup.routes'));
app.use('/api/v1/collector', require('./routes/collector.routes'));
app.use('/api/v1/rewards', require('./routes/reward.routes'));
app.use('/api/v1/redemptions', require('./routes/redemption.routes'));
app.use('/api/v1/admin', require('./routes/admin.routes'));
// Still to add: notifications, rest of admin.

app.use('/api', notFoundHandler); // unknown API paths return JSON 404

// ---------- Frontend (static files) ----------
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number.parseInt(process.env.PORT, 10) || 5000;

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`WRR server running at http://localhost:${PORT}`);
    await testConnection();
  });
}

module.exports = app;
