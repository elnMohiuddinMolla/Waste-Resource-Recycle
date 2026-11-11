// ==============================================================================
// API test helpers.
// The tests rebuild a SEPARATE database (TEST_DB_NAME, default "wrr_test") from
// database/schema.sql + seed.sql before each test file. They refuse to touch wrr_db.
// ==============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const mysql = require('mysql2/promise');

const TEST_DB = process.env.TEST_DB_NAME || 'wrr_test';
if (TEST_DB === 'wrr_db') {
  throw new Error('TEST_DB_NAME must not be wrr_db: the API tests delete and recreate it.');
}

// Must be set before src/config/db.js is loaded
process.env.DB_NAME = TEST_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_only_secret_not_for_real_use_0123456789';
process.env.NODE_ENV = 'test';
// Photos uploaded by the tests go to a temp folder, not backend/uploads
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'wrr-test-uploads');

// A real 1x1 PNG, sent as the waste photo of every test request (PRD v1.4.0, FR-03)
const SAMPLE_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const ROOT = path.join(__dirname, '..', '..', '..');

async function resetDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  try {
    for (const file of ['schema.sql', 'seed.sql']) {
      const sql = fs.readFileSync(path.join(ROOT, 'database', file), 'utf8')
        .replace(/\bwrr_db\b/g, TEST_DB);
      await conn.query(sql);
    }
  } finally {
    await conn.end();
  }
}

function startServer() {
  const app = require('../../src/app');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  async function call(method, url, { body, cookie } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, setCookie: res.headers.get('set-cookie') };
  }

  // GET that returns the raw bytes (for photos)
  async function raw(url, cookie) {
    const res = await fetch(base + url, { headers: cookie ? { Cookie: cookie } : {} });
    return { status: res.status, type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) };
  }

  async function login(email, password = 'password123') {
    const r = await call('POST', '/auth/login', { body: { email, password } });
    if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`);
    return r.setCookie.split(';')[0];
  }

  async function close() {
    server.close();
    await require('../../src/config/db').pool.end();
  }

  return { call, raw, login, close, port: server.address().port };
}

// A date-time string N days from now, in the "YYYY-MM-DDTHH:mm" format the form sends (BST)
function bdDateTime(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86400000 + 6 * 3600000);
  return d.toISOString().slice(0, 16);
}

module.exports = {
  resetDatabase,
  startServer,
  bdDateTime,
  SAMPLE_PHOTO
};
