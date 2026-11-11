// API tests: notifications (api-spec.md Module 7, PRD FR-14)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer } = require('./helpers');

let api;
let pool;
let tanvir; // user 4: seed has 2 notifications, 1 unread (#2 REDEMPTION_PAID)
let sadia;  // user 5: no notifications in the seed
let rafiqul; // collector 2
let admin;

before(async () => {
  await resetDatabase();
  api = startServer();
  pool = require('../../src/config/db').pool;
  tanvir = await api.login('tanvir@gmail.com');
  sadia = await api.login('sadia@gmail.com');
  rafiqul = await api.login('collector1@wrr.com');
  admin = await api.login('admin@wrr.com');
});
after(async () => api && api.close());

const list = (cookie, query = '') => api.call('GET', `/notifications${query}`, { cookie });

test("lists the caller's notifications newest first with the unread count", async () => {
  const r = await list(tanvir);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.unread_count, 1);
  assert.deepEqual(r.body.data.notifications.map((n) => [n.notification_id, n.type, n.is_read]), [
    [2, 'REDEMPTION_PAID', false],
    [1, 'PICKUP_COMPLETED', true]
  ]);
  // Links back to what caused the notification
  assert.equal(r.body.data.notifications[0].redemption_id, 1);
  assert.equal(r.body.data.notifications[1].request_id, 1);
});

test('unread_only and limit filters', async () => {
  let r = await list(tanvir, '?unread_only=true');
  assert.deepEqual(r.body.data.notifications.map((n) => n.notification_id), [2]);

  r = await list(tanvir, '?limit=1');
  assert.equal(r.body.data.notifications.length, 1);
  assert.equal(r.body.data.unread_count, 1); // the count is not limited by the page

  r = await list(tanvir, '?unread_only=yes');
  assert.equal(r.status, 400);
});

test('a user never sees or changes another user\'s notifications', async () => {
  let r = await list(sadia);
  assert.deepEqual(r.body.data, { unread_count: 0, notifications: [] });

  r = await api.call('PATCH', '/notifications/2/read', { cookie: sadia });
  assert.equal(r.status, 404);
  const [[row]] = await pool.query('SELECT is_read FROM notifications WHERE notification_id = 2');
  assert.equal(row.is_read, 0); // still unread
});

test('mark one as read lowers the count; repeating it is still 200', async () => {
  let r = await api.call('PATCH', '/notifications/2/read', { cookie: tanvir });
  assert.equal(r.status, 200);
  r = await list(tanvir);
  assert.equal(r.body.data.unread_count, 0);

  r = await api.call('PATCH', '/notifications/2/read', { cookie: tanvir });
  assert.equal(r.status, 200);

  r = await api.call('PATCH', '/notifications/99999/read', { cookie: tanvir });
  assert.equal(r.status, 404);
  r = await api.call('PATCH', '/notifications/abc/read', { cookie: tanvir });
  assert.equal(r.status, 404);
});

test('the collector receives PICKUP_ASSIGNED and can mark all as read', async () => {
  const assign = await api.call('PUT', '/admin/pickup-requests/3/assign', { cookie: admin, body: { collector_id: 2 } });
  assert.equal(assign.status, 200);

  let r = await list(rafiqul, '?unread_only=true');
  assert.equal(r.body.data.unread_count, 1);
  assert.equal(r.body.data.notifications[0].type, 'PICKUP_ASSIGNED');
  assert.equal(r.body.data.notifications[0].request_id, 3);

  r = await api.call('PATCH', '/notifications/read-all', { cookie: rafiqul });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { updated: 1 });

  r = await api.call('PATCH', '/notifications/read-all', { cookie: rafiqul });
  assert.deepEqual(r.body.data, { updated: 0 });
  r = await list(rafiqul);
  assert.equal(r.body.data.unread_count, 0);
});

test('admins get an empty list (they use dashboard queues) and no cookie is 401', async () => {
  let r = await list(admin);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.unread_count, 0);

  r = await list(undefined);
  assert.equal(r.status, 401);
  r = await api.call('PATCH', '/notifications/read-all');
  assert.equal(r.status, 401);
});
