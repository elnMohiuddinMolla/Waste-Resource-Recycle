// API tests: admin zones (api-spec.md §8.7, PRD FR-19)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer, bdDateTime } = require('./helpers');

let api;
let pool;
let admin;
let tanvir; // user 4, zone 1
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

const create = (body, cookie = admin) => api.call('POST', '/admin/zones', { cookie, body });
const update = (id, body, cookie = admin) => api.call('PUT', `/admin/zones/${id}`, { cookie, body });

test('admin lists every zone, including inactive ones', async () => {
  await pool.query('UPDATE zones SET is_active = FALSE WHERE zone_id = 4');
  try {
    const r = await api.call('GET', '/admin/zones', { cookie: admin });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 4);
    const z4 = r.body.data.find((z) => z.zone_id === 4);
    assert.equal(z4.name, 'Zone 4 - Aliabad');
    assert.equal(z4.is_active, false);
  } finally {
    await pool.query('UPDATE zones SET is_active = TRUE WHERE zone_id = 4');
  }
});

test('create a zone with or without a description', async () => {
  let r = await create({ name: 'Zone 5 - Ambikapur', description: 'Covers Ambikapur and north peri-urban areas.' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, {
    zone_id: r.body.data.zone_id,
    name: 'Zone 5 - Ambikapur',
    description: 'Covers Ambikapur and north peri-urban areas.',
    is_active: true
  });

  r = await create({ name: 'Zone 6 - Kamarkhali' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.description, null);

  const pub = await api.call('GET', '/zones');
  assert.ok(pub.body.data.some((z) => z.name === 'Zone 5 - Ambikapur'));
});

test('duplicate names are refused, ignoring letter case', async () => {
  let r = await create({ name: 'zone 1 - baitul aman' });
  assert.equal(r.status, 409);
  r = await update(2, { name: 'ZONE 3 - JHILTULY' });
  assert.equal(r.status, 409);
  r = await update(2, { name: 'Zone 2 - Goalchamot' }); // its own name is fine
  assert.equal(r.status, 200);
});

test('rename and clear the description (partial update)', async () => {
  let r = await update(3, { name: 'Zone 3 - Jhiltuly & Court Area' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.name, 'Zone 3 - Jhiltuly & Court Area');
  assert.match(r.body.data.description, /Jhiltuly/); // unchanged

  r = await update(3, { description: '' });
  assert.equal(r.body.data.description, null);
  assert.equal(r.body.data.name, 'Zone 3 - Jhiltuly & Court Area');
});

test('validation errors and unknown id', async () => {
  let r = await create({ name: 'Z', description: 42 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['description', 'name']);
  r = await create({ name: 'Zone 9', description: 'x'.repeat(1001) });
  assert.equal(r.status, 400);
  r = await update(1, {});
  assert.equal(r.status, 400);
  r = await update(1, { is_active: 0 });
  assert.equal(r.status, 400);
  r = await update(99999, { is_active: false });
  assert.equal(r.status, 404);
});

test('a deactivated zone cannot be picked for new users or requests; existing ones keep it', async () => {
  let r = await update(1, { is_active: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.is_active, false);
  try {
    const pub = await api.call('GET', '/zones');
    assert.ok(pub.body.data.every((z) => z.zone_id !== 1));

    r = await api.call('POST', '/auth/register', {
      body: { full_name: 'New Person', email: 'new.person@example.com', phone: '01811000077', password: 'password123', zone_id: 1 }
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.errors[0].field, 'zone_id');

    r = await api.call('POST', '/pickup-requests', {
      cookie: tanvir,
      body: { category_id: 1, zone_id: 1, pickup_address: 'House 14', contact_phone: '01811000004', estimated_weight_kg: 3, preferred_at: bdDateTime(1) }
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.errors[0].field, 'zone_id');

    // Existing data is untouched: Tanvir still belongs to zone 1, and seed request 2 (zone 1) still works
    const me = await api.call('GET', '/auth/me', { cookie: tanvir });
    assert.equal(me.body.data.zone_id, 1);
    r = await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { request_id: 2, actual_weight_kg: 5 } });
    assert.equal(r.status, 201);
  } finally {
    await update(1, { is_active: true });
  }
});

test('only admins manage zones', async () => {
  let r = await api.call('GET', '/admin/zones', { cookie: tanvir });
  assert.equal(r.status, 403);
  r = await create({ name: 'Zone 7' }, rafiqul);
  assert.equal(r.status, 403);
  r = await api.call('PUT', '/admin/zones/1', { body: { is_active: false } });
  assert.equal(r.status, 401);
});
