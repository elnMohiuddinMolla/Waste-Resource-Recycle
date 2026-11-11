// API tests: admin assignment + collector workflow (api-spec.md Module 4, §8.1, §8.2)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer, bdDateTime } = require('./helpers');

let api;
let pool;
let tanvir;     // user 4
let rafiqul;    // collector 2 (zone 1)
let kamal;      // collector 3 (zone 2)
let admin;      // admin 1

before(async () => {
  await resetDatabase();
  api = startServer();
  pool = require('../../src/config/db').pool;
  tanvir = await api.login('tanvir@gmail.com');
  rafiqul = await api.login('collector1@wrr.com');
  kamal = await api.login('collector2@wrr.com');
  admin = await api.login('admin@wrr.com');
});
after(async () => api && api.close());

// Creates a new Pending request for Tanvir and returns its id
async function newRequest(categoryId = 2) {
  const r = await api.call('POST', '/pickup-requests', {
    cookie: tanvir,
    body: {
      category_id: categoryId,
      zone_id: 1,
      pickup_address: 'House 14, Road 2, Baitul Aman',
      contact_phone: '01811000004',
      estimated_weight_kg: 20,
      preferred_at: bdDateTime(1)
    }
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.request_id;
}

const assign = (id, collectorId, cookie = admin) =>
  api.call('PUT', `/admin/pickup-requests/${id}/assign`, { cookie, body: { collector_id: collectorId } });

async function statusOf(id) {
  const [[row]] = await pool.query('SELECT status, collector_id FROM pickup_requests WHERE request_id = ?', [id]);
  return row;
}

async function balanceOf(userId) {
  const [[row]] = await pool.query('SELECT COALESCE(SUM(points), 0) AS b FROM reward_transactions WHERE user_id = ?', [userId]);
  return row.b;
}

// ---------- Admin queue ----------

test('admin sees the Pending queue; other roles are refused', async () => {
  let r = await api.call('GET', '/admin/pickup-requests?status=Pending', { cookie: admin });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.requests.some((x) => x.request_id === 3 && x.user_name === 'Sadia Sultana'));
  assert.ok(r.body.data.requests.every((x) => x.status === 'Pending'));

  r = await api.call('GET', '/admin/pickup-requests?zone_id=3', { cookie: admin });
  assert.ok(r.body.data.requests.every((x) => x.zone_name === 'Zone 3 - Jhiltuly'));

  r = await api.call('GET', '/admin/pickup-requests', { cookie: tanvir });
  assert.equal(r.status, 403);
  r = await api.call('GET', '/admin/pickup-requests', { cookie: rafiqul });
  assert.equal(r.status, 403);
});

// ---------- Happy path (FR-07 → FR-10) ----------

test('full workflow: assign → accept → weigh → complete credits the right EARN points', async () => {
  const before = Number(await balanceOf(4)); // 55.00 from seed
  const id = await newRequest(2); // Paper & Cardboard, 6.00 pts/kg

  let r = await assign(id, 2);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, { request_id: id, collector_id: 2, status: 'Assigned' });

  r = await api.call('GET', '/collector/requests', { cookie: rafiqul });
  assert.equal(r.status, 200);
  const job = r.body.data.find((x) => x.request_id === id);
  assert.equal(job.status, 'Assigned');
  assert.equal(job.contact_phone, '01811000004');

  r = await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Accepted');

  r = await api.call('POST', '/collector/collection-records', {
    cookie: rafiqul,
    body: { request_id: id, actual_weight_kg: 18.75, remarks: 'Dry cardboard, digital scale.' }
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.points_per_kg_applied, '6.00');
  assert.equal(r.body.data.calculated_points, '112.50');
  assert.equal(r.body.data.status, 'Collected');

  // Admin raises the rate after weighing: the reward must still use the snapshot (6.00)
  await pool.query('UPDATE waste_categories SET points_per_kg = 9.00 WHERE category_id = 2');
  try {
    r = await api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.data, { request_id: id, status: 'Completed', points_credited: '112.50' });
  } finally {
    await pool.query('UPDATE waste_categories SET points_per_kg = 6.00 WHERE category_id = 2');
  }

  assert.equal(Number(await balanceOf(4)), before + 112.5);

  const [[record]] = await pool.query('SELECT completed_at FROM collection_records WHERE request_id = ?', [id]);
  assert.ok(record.completed_at);

  const d = await api.call('GET', `/pickup-requests/${id}`, { cookie: tanvir });
  assert.equal(d.body.data.points_earned, '112.50');
  assert.deepEqual(d.body.data.timeline.map((t) => t.new_status), ['Pending', 'Assigned', 'Accepted', 'Collected', 'Completed']);

  const [userNotes] = await pool.query('SELECT type FROM notifications WHERE request_id = ? AND user_id = 4 ORDER BY notification_id', [id]);
  assert.deepEqual(userNotes.map((n) => n.type), ['PICKUP_SUBMITTED', 'PICKUP_ACCEPTED', 'PICKUP_COLLECTED', 'PICKUP_COMPLETED']);
  const [collectorNotes] = await pool.query('SELECT type FROM notifications WHERE request_id = ? AND user_id = 2', [id]);
  assert.deepEqual(collectorNotes.map((n) => n.type), ['PICKUP_ASSIGNED']);

  // Completing again is an invalid transition, and no second EARN row appears
  r = await api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul });
  assert.equal(r.status, 409);
  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) AS n FROM reward_transactions rt JOIN collection_records cr ON cr.record_id = rt.record_id WHERE cr.request_id = ? AND rt.txn_type = 'EARN'",
    [id]
  );
  assert.equal(Number(n), 1);
});

test('points are rounded to 2 decimals by the database', async () => {
  const id = await newRequest(5); // Glass, 4.00 pts/kg
  await assign(id, 2);
  await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  const r = await api.call('POST', '/collector/collection-records', {
    cookie: rafiqul, body: { request_id: id, actual_weight_kg: 1.33 }
  });
  assert.equal(r.body.data.calculated_points, '5.32');
  const c = await api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul });
  assert.equal(c.body.data.points_credited, '5.32');
});

test('two "complete" calls at the same moment credit the points only once', async () => {
  const id = await newRequest(1); // Plastic, 10.00 pts/kg
  await assign(id, 2);
  await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { request_id: id, actual_weight_kg: 2 } });
  const before = Number(await balanceOf(4));

  const results = await Promise.all([
    api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul }),
    api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul })
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(Number(await balanceOf(4)), before + 20);
});

// ---------- Reject and reassign (T5, T2) ----------

test('reject clears the collector, then the admin reassigns', async () => {
  const id = await newRequest();
  await assign(id, 2);

  let r = await api.call('PUT', `/collector/requests/${id}/reject`, { cookie: rafiqul, body: { reason: 'no' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'reason');

  r = await api.call('PUT', `/collector/requests/${id}/reject`, {
    cookie: rafiqul, body: { reason: 'Vehicle breakdown today.' }
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Rejected');
  assert.deepEqual(await statusOf(id), { status: 'Rejected', collector_id: null });

  // The old collector can no longer touch it
  r = await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  assert.equal(r.status, 404);

  // It shows in the admin Rejected queue and can be reassigned (T2)
  r = await api.call('GET', '/admin/pickup-requests?status=Rejected', { cookie: admin });
  assert.ok(r.body.data.requests.some((x) => x.request_id === id));
  r = await assign(id, 3);
  assert.equal(r.status, 200);

  const [logs] = await pool.query('SELECT changed_by_id, new_status, note FROM request_status_logs WHERE request_id = ? ORDER BY log_id', [id]);
  assert.deepEqual(logs.map((l) => l.new_status), ['Pending', 'Assigned', 'Rejected', 'Assigned']);
  assert.equal(logs[2].changed_by_id, 2);
  assert.equal(logs[2].note, 'Vehicle breakdown today.');
  assert.match(logs[3].note, /^Reassigned to Kamal Hossain/);

  const [notes] = await pool.query("SELECT type FROM notifications WHERE request_id = ? AND user_id = 4 AND type = 'PICKUP_REJECTED'", [id]);
  assert.equal(notes.length, 1);
});

// ---------- On-site abort (T7) ----------

test('abort works only from Accepted', async () => {
  const id = await newRequest();
  await assign(id, 2);

  let r = await api.call('PUT', `/collector/requests/${id}/abort`, { cookie: rafiqul, body: { reason: 'Resident absent' } });
  assert.equal(r.status, 409); // still Assigned

  await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  r = await api.call('PUT', `/collector/requests/${id}/abort`, {
    cookie: rafiqul, body: { reason: 'Resident absent, phone unreachable after 3 calls.' }
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Cancelled');

  const [notes] = await pool.query("SELECT message FROM notifications WHERE request_id = ? AND type = 'PICKUP_ABORTED'", [id]);
  assert.match(notes[0].message, /Resident absent/);
});

// ---------- Refused changes ----------

test('illegal jumps give 409', async () => {
  const id = await newRequest();

  // Pending: collector actions are not possible (it has no collector yet → 404 for them)
  let r = await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  assert.equal(r.status, 404);

  await assign(id, 2);
  r = await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { request_id: id, actual_weight_kg: 5 } });
  assert.equal(r.status, 409); // Assigned → Collected skips Accepted
  r = await api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul });
  assert.equal(r.status, 409);

  await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  r = await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  assert.equal(r.status, 409); // already Accepted
  r = await assign(id, 3);
  assert.equal(r.status, 409); // admin cannot reassign an Accepted job

  // Seed request 1 is Completed
  r = await assign(1, 2);
  assert.equal(r.status, 409);
});

test('assignment checks the collector and the request', async () => {
  const id = await newRequest();

  let r = await assign(id, 4); // a General User
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'collector_id');

  await pool.query("UPDATE users SET status = 'inactive' WHERE user_id = 3");
  try {
    r = await assign(id, 3);
    assert.equal(r.status, 400);
  } finally {
    await pool.query("UPDATE users SET status = 'active' WHERE user_id = 3");
  }

  r = await api.call('PUT', `/admin/pickup-requests/${id}/assign`, { cookie: admin, body: {} });
  assert.equal(r.status, 400);
  r = await assign(99999, 2);
  assert.equal(r.status, 404);
  r = await assign(id, 2, tanvir);
  assert.equal(r.status, 403);

  assert.equal((await statusOf(id)).status, 'Pending'); // nothing changed
});

test("a collector cannot act on another collector's job", async () => {
  // Seed request 2 is Accepted by Rafiqul
  let r = await api.call('PUT', '/collector/requests/2/abort', { cookie: kamal, body: { reason: 'Not my job really' } });
  assert.equal(r.status, 404);
  r = await api.call('POST', '/collector/collection-records', { cookie: kamal, body: { request_id: 2, actual_weight_kg: 3 } });
  assert.equal(r.status, 404);

  r = await api.call('GET', '/collector/requests', { cookie: kamal });
  assert.ok(r.body.data.every((x) => x.request_id !== 2));

  r = await api.call('GET', '/collector/requests', { cookie: tanvir });
  assert.equal(r.status, 403);
});

test('weight validation', async () => {
  let r = await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { request_id: 2, actual_weight_kg: 0 } });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'actual_weight_kg');
  r = await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { actual_weight_kg: 3 } });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'request_id');
});

// ---------- History (FR-12) ----------

test('collector history lists completed records with a summary', async () => {
  let r = await api.call('GET', '/collector/history', { cookie: rafiqul });
  assert.equal(r.status, 200);
  // seed record 1 (15.50) + 18.75 + 1.33 + 2.00 from the tests above
  assert.equal(r.body.data.summary.total_completed_pickups, 4);
  assert.equal(r.body.data.summary.total_kg_collected, '37.58');
  assert.ok(r.body.data.records.every((x) => x.completed_at));

  r = await api.call('GET', '/collector/history?from=2026-11-10&to=2026-11-10', { cookie: rafiqul });
  assert.equal(r.body.data.summary.total_completed_pickups, 1); // only the seed record

  // Category filter (FR-12): only the 18.75 kg Paper & Cardboard job
  r = await api.call('GET', '/collector/history?category_id=2', { cookie: rafiqul });
  assert.equal(r.body.data.summary.total_completed_pickups, 1);
  assert.equal(r.body.data.summary.total_kg_collected, '18.75');
  assert.ok(r.body.data.records.every((x) => x.category_name === 'Paper & Cardboard'));

  r = await api.call('GET', '/collector/history?from=10-11-2026', { cookie: rafiqul });
  assert.equal(r.status, 400);
  r = await api.call('GET', '/collector/history?to=2026-02-31', { cookie: rafiqul });
  assert.equal(r.status, 400);

  r = await api.call('GET', '/collector/history', { cookie: kamal });
  assert.equal(r.body.data.summary.total_completed_pickups, 0);
});
