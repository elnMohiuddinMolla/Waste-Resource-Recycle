// API tests: admin user & collector management (api-spec.md §8.9, PRD FR-20, requirement-validation MF-02)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer } = require('./helpers');

let api;
let pool;
let admin;   // user 1
let tanvir;  // user 4

before(async () => {
  await resetDatabase();
  api = startServer();
  pool = require('../../src/config/db').pool;
  admin = await api.login('admin@wrr.com');
  tanvir = await api.login('tanvir@gmail.com');
});
after(async () => api && api.close());

const users = (query = '', cookie = admin) => api.call('GET', `/admin/users${query}`, { cookie });
const setStatus = (id, status, cookie = admin) => api.call('PATCH', `/admin/users/${id}/status`, { cookie, body: { status } });
const setZone = (id, zone_id) => api.call('PATCH', `/admin/users/${id}/zone`, { cookie: admin, body: { zone_id } });

const newCollector = (overrides = {}) => api.call('POST', '/admin/collectors', {
  cookie: admin,
  body: { full_name: 'Jashim Uddin', email: 'collector3@wrr.com', phone: '01711000006', password: 'password123', zone_id: 3, ...overrides }
});

test('list all accounts with zone name and open jobs, never the password hash', async () => {
  const r = await users();
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 5);
  const rafiqul = r.body.data.users.find((u) => u.user_id === 2);
  assert.equal(rafiqul.zone_name, 'Zone 1 - Baitul Aman');
  assert.equal(rafiqul.open_jobs, 1); // seed request 2 is Accepted by him
  assert.ok(r.body.data.users.every((u) => !('password_hash' in u)));
});

test('filters by role, status and zone; bad filters are 400', async () => {
  let r = await users('?role=collector');
  assert.deepEqual(r.body.data.users.map((u) => u.user_id).sort(), [2, 3]);
  r = await users('?role=user&zone_id=3');
  assert.deepEqual(r.body.data.users.map((u) => u.user_id), [5]);
  r = await users('?status=inactive');
  assert.equal(r.body.data.total, 0);
  r = await users('?limit=2');
  assert.equal(r.body.data.users.length, 2);
  assert.equal(r.body.data.total, 5);

  assert.equal((await users('?role=boss')).status, 400);
  assert.equal((await users('?status=deleted')).status, 400);
  assert.equal((await users('?zone_id=x')).status, 400);
});

test('admin creates a collector who can log in and use the collector API', async () => {
  const r = await newCollector({ email: 'Collector3@WRR.com' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.role, 'collector');
  assert.equal(r.body.data.email, 'collector3@wrr.com');
  assert.equal(r.body.data.zone_name, 'Zone 3 - Jhiltuly');
  assert.equal(r.body.data.open_jobs, 0);
  assert.equal('password_hash' in r.body.data, false);

  const cookie = await api.login('collector3@wrr.com');
  const jobs = await api.call('GET', '/collector/requests', { cookie });
  assert.equal(jobs.status, 200);
});

test('collector creation uses the same rules as registration', async () => {
  let r = await newCollector({ email: 'tanvir@gmail.com' });
  assert.equal(r.status, 409);

  r = await newCollector({ email: 'c4@wrr.com', zone_id: undefined });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'zone_id');

  r = await newCollector({ full_name: 'X', email: 'bad', phone: '1', password: 'short', zone_id: 99 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['email', 'full_name', 'password', 'phone', 'zone_id']);
});

test('deactivating a user blocks login and the session they already have', async () => {
  let r = await setStatus(4, 'inactive');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'inactive');

  r = await api.call('GET', '/auth/me', { cookie: tanvir });
  assert.equal(r.status, 403);
  r = await api.call('POST', '/auth/login', { body: { email: 'tanvir@gmail.com', password: 'password123' } });
  assert.equal(r.status, 403);

  r = await setStatus(4, 'active');
  assert.equal(r.body.data.status, 'active');
  r = await api.call('GET', '/auth/me', { cookie: tanvir });
  assert.equal(r.status, 200);
});

test('a collector with open jobs can be deactivated; the response shows how many', async () => {
  const r = await setStatus(2, 'inactive');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.open_jobs, 1);
  await setStatus(2, 'active');
});

test('an admin cannot deactivate their own account', async () => {
  const r = await setStatus(1, 'inactive');
  assert.equal(r.status, 409);
  const [[row]] = await pool.query('SELECT status FROM users WHERE user_id = 1');
  assert.equal(row.status, 'active');
});

test("change a collector's zone; only collectors and active zones", async () => {
  let r = await setZone(3, 4);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.zone_id, 4);
  assert.equal(r.body.data.zone_name, 'Zone 4 - Aliabad');

  r = await setZone(4, 2); // a General User
  assert.equal(r.status, 409);

  await pool.query('UPDATE zones SET is_active = FALSE WHERE zone_id = 2');
  try {
    r = await setZone(3, 2);
    assert.equal(r.status, 400);
  } finally {
    await pool.query('UPDATE zones SET is_active = TRUE WHERE zone_id = 2');
  }

  r = await setZone(3, 'two');
  assert.equal(r.status, 400);
  r = await setZone(99999, 1);
  assert.equal(r.status, 404);
});

test('bad status values and unknown users', async () => {
  assert.equal((await setStatus(4, 'banned')).status, 400);
  assert.equal((await setStatus(99999, 'inactive')).status, 404);
  assert.equal((await setStatus('abc', 'inactive')).status, 404);
});

test('only admins manage accounts', async () => {
  let r = await users('', tanvir);
  assert.equal(r.status, 403);
  r = await setStatus(5, 'inactive', tanvir);
  assert.equal(r.status, 403);
  r = await api.call('POST', '/admin/collectors', { body: {} });
  assert.equal(r.status, 401);
});
