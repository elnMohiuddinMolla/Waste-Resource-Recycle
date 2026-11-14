// Unit tests: JWT secret check and startup refusal (NFR-03)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { secretProblem, MIN_LENGTH } = require('../../src/config/secret');

test('secretProblem accepts only long, non-example secrets', () => {
  assert.equal(secretProblem('a'.repeat(MIN_LENGTH)), null);
  assert.match(secretProblem(undefined), /missing/);
  assert.match(secretProblem(''), /missing/);
  assert.match(secretProblem('change_me_to_a_long_random_string'), /example value/);
  assert.match(secretProblem('short-secret'), /at least 32/);
});

// Starts src/app.js in a separate Node process with the given secret
function startApp(secret) {
  const backend = path.join(__dirname, '..', '..');
  return spawnSync(process.execPath, ['-e', "require('./src/app')"], {
    cwd: backend,
    env: { ...process.env, JWT_SECRET: secret, DB_NAME: 'wrr_test' },
    encoding: 'utf8',
    timeout: 15000
  });
}

test('the server refuses to start with the example or a short secret', () => {
  let r = startApp('change_me_to_a_long_random_string');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /example value/);

  r = startApp('too-short');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /at least 32/);
});

// Security headers: HSTS only when the request came over HTTPS
const { securityHeaders } = require('../../src/middleware/securityHeaders');

function headersFor(req) {
  const headers = {};
  securityHeaders(req, { setHeader: (k, v) => { headers[k] = v; } }, () => {});
  return headers;
}

test('Strict-Transport-Security is sent over HTTPS only', () => {
  assert.equal(headersFor({ secure: true })['Strict-Transport-Security'], 'max-age=31536000');
  assert.equal(headersFor({ secure: false })['Strict-Transport-Security'], undefined);
  assert.equal(headersFor({ secure: false })['X-Frame-Options'], 'DENY');
});
