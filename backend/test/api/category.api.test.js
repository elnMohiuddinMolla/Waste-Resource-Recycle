// API tests: admin waste categories (api-spec.md §8.6, PRD FR-04, §5.2, requirement-validation EC-03)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer, bdDateTime, SAMPLE_PHOTO } = require('./helpers');

let api;
let pool;
let admin;
let tanvir;
let rafiqul; // collector 2

before(async () => {
  await resetDatabase();
  api = startServer();
  pool = require('../../src/config/db').pool;
  admin = await api.login('admin@wrr.com');
  tanvir = await api.login('tanvir@gmail.com');
  rafiqul = await api.login('collector1@wrr.com');
});
after(async () => api && api.close());

const create = (body, cookie = admin) => api.call('POST', '/admin/categories', { cookie, body });
const update = (id, body, cookie = admin) => api.call('PUT', `/admin/categories/${id}`, { cookie, body });

function requestBody(categoryId) {
  return {
    category_id: categoryId,
    zone_id: 1,
    pickup_address: 'House 14, Road 2, Baitul Aman',
    contact_phone: '01811000004',
    estimated_weight_kg: 4,
    preferred_at: bdDateTime(1),
    photo: SAMPLE_PHOTO
  };
}

test('admin lists every category, including inactive ones, with booleans', async () => {
  await pool.query('UPDATE waste_categories SET is_active = FALSE WHERE category_id = 5');
  try {
    const r = await api.call('GET', '/admin/categories', { cookie: admin });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 6);
    const glass = r.body.data.find((c) => c.category_id === 5);
    assert.deepEqual(glass, { category_id: 5, name: 'Glass', points_per_kg: '4.00', is_other: false, is_active: false });
  } finally {
    await pool.query('UPDATE waste_categories SET is_active = TRUE WHERE category_id = 5');
  }
});

test('create a category; it appears in the public list', async () => {
  const r = await create({ name: 'Aluminum Cans', points_per_kg: 18 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, {
    category_id: r.body.data.category_id, name: 'Aluminum Cans', points_per_kg: '18.00', is_other: false, is_active: true
  });

  const pub = await api.call('GET', '/categories');
  assert.ok(pub.body.data.some((c) => c.name === 'Aluminum Cans'));
});

test('a rate of 0 is allowed', async () => {
  const r = await create({ name: 'Mixed Low Value', points_per_kg: 0, is_other: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.points_per_kg, '0.00');
  assert.equal(r.body.data.is_other, true);
});

test('duplicate names are refused, ignoring letter case', async () => {
  let r = await create({ name: 'plastic', points_per_kg: 3 });
  assert.equal(r.status, 409);
  assert.match(r.body.message, /already exists/);

  r = await update(2, { name: 'E-WASTE' }); // rename Paper to an existing name
  assert.equal(r.status, 409);
  r = await update(2, { name: 'Paper & Cardboard' }); // its own name is fine
  assert.equal(r.status, 200);
});

test('validation errors', async () => {
  let r = await create({ name: 'A', points_per_kg: -1, is_other: 'yes' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['is_other', 'name', 'points_per_kg']);

  r = await update(1, {});
  assert.equal(r.status, 400);
  r = await update(1, { is_active: 'false' });
  assert.equal(r.status, 400);
  r = await update(99999, { points_per_kg: 5 });
  assert.equal(r.status, 404);
});

test('a rate change applies to new weighings only (snapshot rule)', async () => {
  const r = await update(1, { points_per_kg: 12 });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.points_per_kg, '12.00');

  const pub = await api.call('GET', '/categories');
  assert.equal(pub.body.data.find((c) => c.category_id === 1).points_per_kg, '12.00');

  // Seed record 1 (Plastic) still uses the rate it was weighed with
  const [[rec]] = await pool.query('SELECT points_per_kg_applied FROM collection_records WHERE record_id = 1');
  assert.equal(rec.points_per_kg_applied, '10.00');
  const d = await api.call('GET', '/pickup-requests/1', { cookie: tanvir });
  assert.equal(d.body.data.points_earned, '155.00');

  await update(1, { points_per_kg: 10 });
});

test('deactivating hides the category from new requests, but jobs in progress can finish (EC-03)', async () => {
  // A request already in progress in Metal (15.00 pts/kg)
  const created = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: requestBody(4) });
  const id = created.body.data.request_id;
  await api.call('PUT', `/admin/pickup-requests/${id}/assign`, { cookie: admin, body: { collector_id: 2 } });

  let r = await update(4, { is_active: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.is_active, false);

  const pub = await api.call('GET', '/categories');
  assert.ok(pub.body.data.every((c) => c.category_id !== 4));
  r = await api.call('POST', '/pickup-requests', { cookie: tanvir, body: requestBody(4) });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'category_id');

  // The in-progress job still completes and earns 2 kg × 15.00 = 30.00
  await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  r = await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { request_id: id, actual_weight_kg: 2 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.points_per_kg_applied, '15.00');
  r = await api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.points_credited, '30.00');

  r = await update(4, { is_active: true });
  assert.equal(r.body.data.is_active, true);
});

test('only admins manage categories', async () => {
  let r = await api.call('GET', '/admin/categories', { cookie: tanvir });
  assert.equal(r.status, 403);
  r = await create({ name: 'Rubber', points_per_kg: 3 }, rafiqul);
  assert.equal(r.status, 403);
  r = await api.call('GET', '/admin/categories');
  assert.equal(r.status, 401);
});
