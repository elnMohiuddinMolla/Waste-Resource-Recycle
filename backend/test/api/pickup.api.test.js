// API tests: catalog + pickup requests, user side (api-spec.md Modules 2 and 3)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer, bdDateTime, SAMPLE_PHOTO } = require('./helpers');

let api;
let tanvir; // user 4, zone 1
let sadia;  // user 5, zone 3
let collector1;
let admin;

const validBody = () => ({
  category_id: 1,
  zone_id: 1,
  pickup_address: 'House 14, Road 2, Baitul Aman',
  contact_phone: '01811000004',
  estimated_weight_kg: 8.5,
  preferred_at: bdDateTime(2),
  photo: SAMPLE_PHOTO
});

before(async () => {
  await resetDatabase();
  api = startServer();
  tanvir = await api.login('tanvir@gmail.com');
  sadia = await api.login('sadia@gmail.com');
  collector1 = await api.login('collector1@wrr.com');
  admin = await api.login('admin@wrr.com');
});
after(async () => api && api.close());

// ---------- Catalog ----------

test('GET /categories is public and lists active categories', async () => {
  const r = await api.call('GET', '/categories');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 6);
  const other = r.body.data.find((c) => c.name === 'Other Recyclable Waste');
  assert.equal(other.is_other, true);
  assert.equal(other.points_per_kg, '5.00');
});

test('GET /zones is public and lists active zones', async () => {
  const r = await api.call('GET', '/zones');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 4);
  assert.equal(r.body.data[0].name, 'Zone 1 - Baitul Aman');
});

// ---------- Submit (FR-03) ----------

test('a user submits a request: 201, Pending, log and notification written', async () => {
  const r = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: validBody() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'Pending');

  const d = await api.call('GET', `/pickup-requests/${r.body.data.request_id}`, { cookie: tanvir });
  assert.equal(d.status, 200);
  assert.equal(d.body.data.timeline.length, 1);
  assert.equal(d.body.data.timeline[0].old_status, null);
  assert.equal(d.body.data.timeline[0].new_status, 'Pending');
  assert.equal(d.body.data.collector, null);

  const { pool } = require('../../src/config/db');
  const [rows] = await pool.query(
    "SELECT type FROM notifications WHERE request_id = ? AND user_id = 4", [r.body.data.request_id]
  );
  assert.deepEqual(rows.map((x) => x.type), ['PICKUP_SUBMITTED']);
});

test('submit validates the body', async () => {
  const r = await api.call('POST', '/pickup-requests', {
    cookie: tanvir,
    body: { category_id: 'x', zone_id: 0, pickup_address: '', contact_phone: '123', estimated_weight_kg: 0, preferred_at: 'tomorrow' }
  });
  assert.equal(r.status, 400);
  assert.deepEqual(
    r.body.errors.map((e) => e.field).sort(),
    ['category_id', 'contact_phone', 'estimated_weight_kg', 'photo', 'pickup_address', 'preferred_at', 'zone_id']
  );
});

test('preferred_at in the past is refused', async () => {
  const r = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: { ...validBody(), preferred_at: bdDateTime(-1) } });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'preferred_at');
  assert.equal(r.body.errors[0].message, 'Preferred date must be in the future.');
});

test("'Other' category needs a description", async () => {
  let r = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: { ...validBody(), category_id: 6 } });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'other_description');

  r = await api.call('POST', '/pickup-requests', {
    cookie: tanvir, body: { ...validBody(), category_id: 6, other_description: 'Old aluminium pots' }
  });
  assert.equal(r.status, 201);
});

test('inactive category or zone is refused', async () => {
  const { pool } = require('../../src/config/db');
  await pool.query('UPDATE waste_categories SET is_active = FALSE WHERE category_id = 5');
  await pool.query('UPDATE zones SET is_active = FALSE WHERE zone_id = 4');
  try {
    const r = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: { ...validBody(), category_id: 5, zone_id: 4 } });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['category_id', 'zone_id']);
  } finally {
    await pool.query('UPDATE waste_categories SET is_active = TRUE WHERE category_id = 5');
    await pool.query('UPDATE zones SET is_active = TRUE WHERE zone_id = 4');
  }
});

test('only the user role can submit', async () => {
  let r = await api.call('POST', '/pickup-requests', { cookie: collector1, body: validBody() });
  assert.equal(r.status, 403);
  r = await api.call('POST', '/pickup-requests', { body: validBody() });
  assert.equal(r.status, 401);
});

// ---------- List & details (FR-05) ----------

test('GET /mine lists only my requests, newest first, with paging and status filter', async () => {
  let r = await api.call('GET', '/pickup-requests/mine?limit=2', { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.limit, 2);
  assert.equal(r.body.data.requests.length, 2);
  assert.ok(r.body.data.total >= 4); // 2 seed + 2 created above

  r = await api.call('GET', '/pickup-requests/mine?status=Completed', { cookie: tanvir });
  assert.equal(r.body.data.total, 1);
  assert.equal(r.body.data.requests[0].actual_weight_kg, '15.50');
  assert.equal(r.body.data.requests[0].collector_name, 'Rafiqul Islam');

  r = await api.call('GET', '/pickup-requests/mine', { cookie: sadia });
  assert.equal(r.body.data.total, 1);
  assert.equal(r.body.data.requests[0].request_id, 3);

  r = await api.call('GET', '/pickup-requests/mine?status=Done', { cookie: tanvir });
  assert.equal(r.status, 400);
});

test('GET /mine filters by category and date range (FR-12)', async () => {
  let r = await api.call('GET', '/pickup-requests/mine?category_id=2', { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.total >= 1);
  assert.ok(r.body.data.requests.every((x) => x.category_id === 2));

  // Seed request 1 was created on 2026-11-10, request 2 on 2026-11-11
  r = await api.call('GET', '/pickup-requests/mine?from=2026-11-10&to=2026-11-10', { cookie: tanvir });
  assert.deepEqual(r.body.data.requests.map((x) => x.request_id), [1]);

  r = await api.call('GET', '/pickup-requests/mine?from=2026-02-31', { cookie: tanvir });
  assert.equal(r.status, 400);
  r = await api.call('GET', '/pickup-requests/mine?from=2026-11-12&to=2026-11-10', { cookie: tanvir });
  assert.equal(r.status, 400);
  r = await api.call('GET', '/pickup-requests/mine?category_id=abc', { cookie: tanvir });
  assert.equal(r.status, 400);
});

test('details of the completed seed request show points and full timeline', async () => {
  const r = await api.call('GET', '/pickup-requests/1', { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.points_earned, '155.00');
  assert.equal(r.body.data.points_per_kg, '10.00');
  assert.equal(r.body.data.collector.name, 'Rafiqul Islam');
  assert.deepEqual(r.body.data.timeline.map((t) => t.new_status), ['Pending', 'Assigned', 'Accepted', 'Collected', 'Completed']);
});

test("details: other users get 404, assigned collector and admin can view", async () => {
  let r = await api.call('GET', '/pickup-requests/1', { cookie: sadia });
  assert.equal(r.status, 404);
  r = await api.call('GET', '/pickup-requests/1', { cookie: collector1 }); // collector 2 is assigned
  assert.equal(r.status, 200);
  r = await api.call('GET', '/pickup-requests/3', { cookie: collector1 }); // not assigned to them
  assert.equal(r.status, 404);
  r = await api.call('GET', '/pickup-requests/3', { cookie: admin });
  assert.equal(r.status, 200);
  r = await api.call('GET', '/pickup-requests/99999', { cookie: admin });
  assert.equal(r.status, 404);
  r = await api.call('GET', '/pickup-requests/abc', { cookie: admin });
  assert.equal(r.status, 404);
});

// ---------- Cancel (FR-06) ----------

test('the owner can cancel a Pending request, and it is logged', async () => {
  const created = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: validBody() });
  const id = created.body.data.request_id;

  const r = await api.call('PUT', `/pickup-requests/${id}/cancel`, { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Cancelled');

  const d = await api.call('GET', `/pickup-requests/${id}`, { cookie: tanvir });
  assert.deepEqual(d.body.data.timeline.map((t) => [t.old_status, t.new_status]), [[null, 'Pending'], ['Pending', 'Cancelled']]);

  const again = await api.call('PUT', `/pickup-requests/${id}/cancel`, { cookie: tanvir });
  assert.equal(again.status, 409);
});

test('cancelling a request that is not Pending gives 409', async () => {
  const r = await api.call('PUT', '/pickup-requests/2/cancel', { cookie: tanvir }); // seed request 2 is Accepted
  assert.equal(r.status, 409);
  assert.match(r.body.message, /current status: Accepted/);
});

test("a user cannot cancel someone else's request (404)", async () => {
  const r = await api.call('PUT', '/pickup-requests/3/cancel', { cookie: tanvir }); // request 3 belongs to Sadia
  assert.equal(r.status, 404);
  const d = await api.call('GET', '/pickup-requests/3', { cookie: sadia });
  assert.equal(d.body.data.status, 'Pending');
});

// ---------- Waste photo (PRD v1.4.0, FR-03) ----------

test('a photo is required and must really be a JPG, PNG or WebP of at most 2 MB', async () => {
  const send = (photo) => api.call('POST', '/pickup-requests', { cookie: tanvir, body: { ...validBody(), photo } });
  const fieldsOf = (r) => r.body.errors.map((e) => e.field);

  let r = await send(undefined);
  assert.equal(r.status, 400);
  assert.deepEqual(fieldsOf(r), ['photo']);

  // An HTML file labelled as a PNG is refused: the first bytes decide, not the label
  r = await send('data:image/png;base64,' + Buffer.from('<html><script>alert(1)</script></html>').toString('base64'));
  assert.equal(r.status, 400);
  assert.deepEqual(fieldsOf(r), ['photo']);

  r = await send('data:image/gif;base64,R0lGODlhAQABAAAAACw=');
  assert.equal(r.status, 400);

  // 2.1 MB that starts like a JPEG: too big
  const big = Buffer.alloc(2.1 * 1024 * 1024, 0);
  big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  r = await send('data:image/jpeg;base64,' + big.toString('base64'));
  assert.equal(r.status, 400);
  assert.match(r.body.errors[0].message, /2 MB/);

  // A body over the 3 MB limit is refused before it is read
  r = await send('data:image/jpeg;base64,' + Buffer.alloc(3 * 1024 * 1024).toString('base64'));
  assert.equal(r.status, 413);
});

test('the photo is stored and only the owner, the assigned collector and admins can see it', async () => {
  const created = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: validBody() });
  assert.equal(created.status, 201);
  const id = created.body.data.request_id;
  const sample = Buffer.from(SAMPLE_PHOTO.split(',')[1], 'base64');

  const details = await api.call('GET', `/pickup-requests/${id}`, { cookie: tanvir });
  assert.equal(details.body.data.has_photo, true);

  let p = await api.raw(`/pickup-requests/${id}/photo`, tanvir);
  assert.equal(p.status, 200);
  assert.match(p.type, /^image\/png/);
  assert.ok(p.bytes.equals(sample), 'the same bytes come back');

  assert.equal((await api.raw(`/pickup-requests/${id}/photo`, admin)).status, 200);
  assert.equal((await api.raw(`/pickup-requests/${id}/photo`, sadia)).status, 404);      // another user
  assert.equal((await api.raw(`/pickup-requests/${id}/photo`, collector1)).status, 404); // not assigned yet
  assert.equal((await api.raw(`/pickup-requests/${id}/photo`)).status, 401);             // not logged in

  await api.call('PUT', `/admin/pickup-requests/${id}/assign`, { cookie: admin, body: { collector_id: 2 } });
  assert.equal((await api.raw(`/pickup-requests/${id}/photo`, collector1)).status, 200); // now assigned

  const jobs = await api.call('GET', '/collector/requests', { cookie: collector1 });
  assert.equal(Boolean(jobs.body.data.find((j) => j.request_id === id).has_photo), true);
});

test('older requests without a photo say so', async () => {
  const d = await api.call('GET', '/pickup-requests/1', { cookie: tanvir }); // seed request, made before photos
  assert.equal(d.body.data.has_photo, false);
  const p = await api.call('GET', '/pickup-requests/1/photo', { cookie: tanvir });
  assert.equal(p.status, 404);
  assert.match(p.body.message, /no photo/);
});
