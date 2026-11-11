// API tests: authentication (api-spec.md Module 1)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer } = require('./helpers');

let api;
before(async () => {
  await resetDatabase();
  api = startServer();
});
after(async () => api && api.close());

test('register validates every field', async () => {
  const r = await api.call('POST', '/auth/register', {
    body: { full_name: 'A', email: 'bad', phone: '123', password: 'short', zone_id: 99 }
  });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['email', 'full_name', 'password', 'phone', 'zone_id']);
});

test('register refuses a duplicate email with 409 (case-insensitive)', async () => {
  const r = await api.call('POST', '/auth/register', {
    body: { full_name: 'Copy Cat', email: 'Tanvir@gmail.com', phone: '01811000009', password: 'password123', zone_id: 1 }
  });
  assert.equal(r.status, 409);
});

test('register creates a General User and never returns the hash', async () => {
  const r = await api.call('POST', '/auth/register', {
    body: { full_name: 'New Resident', email: 'New@Example.com', phone: '01811000009', password: 'password123', zone_id: 2 }
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.role, 'user');
  assert.equal(r.body.data.email, 'new@example.com');
  assert.equal('password_hash' in r.body.data, false);
});

test('login sets an HttpOnly cookie and does not return the token', async () => {
  const r = await api.call('POST', '/auth/login', { body: { email: 'tanvir@gmail.com', password: 'password123' } });
  assert.equal(r.status, 200);
  assert.equal('token' in r.body.data, false);
  assert.match(r.setCookie, /token=/);
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Lax/i);
  assert.match(r.setCookie, /Max-Age=604800/);
});

test('wrong password gives 401 with a generic message', async () => {
  const r = await api.call('POST', '/auth/login', { body: { email: 'tanvir@gmail.com', password: 'wrong-password' } });
  assert.equal(r.status, 401);
  assert.equal(r.body.message, 'Invalid email or password.');
});

test('/auth/me needs a valid cookie', async () => {
  const cookie = await api.login('tanvir@gmail.com');
  let r = await api.call('GET', '/auth/me', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.zone_name, 'Zone 1 - Baitul Aman');

  r = await api.call('GET', '/auth/me');
  assert.equal(r.status, 401);
  r = await api.call('GET', '/auth/me', { cookie: 'token=garbage' });
  assert.equal(r.status, 401);
});

test('logout clears the cookie', async () => {
  const cookie = await api.login('collector1@wrr.com');
  const r = await api.call('POST', '/auth/logout', { cookie });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /token=;/);
});

test('logout works without a valid session and still clears the cookie', async () => {
  let r = await api.call('POST', '/auth/logout');
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /token=;/);
  r = await api.call('POST', '/auth/logout', { cookie: 'token=expired-or-broken' });
  assert.equal(r.status, 200);
});

test('unknown API paths return JSON 404', async () => {
  const r = await api.call('GET', '/does-not-exist');
  assert.equal(r.status, 404);
  assert.equal(r.body.success, false);
});

// Keep last: it uses up this IP's failed-login allowance
test('5 failed logins in 15 minutes lead to 429', async () => {
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await api.call('POST', '/auth/login', { body: { email: 'admin@wrr.com', password: 'wrong-password' } });
    statuses.push(r.status);
  }
  assert.equal(statuses.at(-1), 429, statuses.join(','));
  assert.ok(statuses.filter((s) => s === 401).length <= 5);
});
