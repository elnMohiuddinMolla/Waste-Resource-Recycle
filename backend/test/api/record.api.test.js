// API tests: admin collection records + weight correction
// (api-spec.md §8.5, PRD FR-18, §5.3, NFR-08, requirement-validation EC-01)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer, bdDateTime } = require('./helpers');

let api;
let pool;
let admin;
let tanvir;  // user 4: seed balance 55.00; seed record 1 = 15.50 kg Plastic @ 10.00 = 155.00
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

const correct = (id, body, cookie = admin) => api.call('PUT', `/admin/collection-records/${id}`, { cookie, body });

async function balance() {
  const r = await api.call('GET', '/rewards/balance', { cookie: tanvir });
  return r.body.data.available_balance;
}

async function recordTotal(recordId) {
  const [[row]] = await pool.query(
    "SELECT COALESCE(SUM(points), 0) AS total FROM reward_transactions WHERE record_id = ? AND txn_type IN ('EARN', 'ADJUST')",
    [recordId]
  );
  return row.total;
}

// ---------- List ----------

test('admin lists collection records with the points posted so far', async () => {
  let r = await api.call('GET', '/admin/collection-records', { cookie: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 1);
  const rec = r.body.data.records[0];
  assert.equal(rec.record_id, 1);
  assert.equal(rec.user_name, 'Tanvir Ahmed');
  assert.equal(rec.collector_name, 'Rafiqul Islam');
  assert.equal(rec.category_name, 'Plastic');
  assert.equal(rec.zone_name, 'Zone 1 - Baitul Aman');
  assert.equal(rec.points_posted, '155.00');
  assert.equal(rec.request_status, 'Completed');

  r = await api.call('GET', '/admin/collection-records?zone_id=3', { cookie: admin });
  assert.equal(r.body.data.total, 0);
  r = await api.call('GET', '/admin/collection-records?from=2026-11-10&to=2026-11-10', { cookie: admin });
  assert.equal(r.body.data.total, 1);
  r = await api.call('GET', '/admin/collection-records?from=2026-02-31', { cookie: admin });
  assert.equal(r.status, 400);
});

// ---------- Corrections (run in order on seed record 1) ----------

test('downward correction 15.50 → 12.00 posts one ADJUST of −35.00 and one audit row', async () => {
  const r = await correct(1, { actual_weight_kg: 12, remarks: 'Admin audited the scale ticket.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, { record_id: 1, corrected_weight_kg: '12.00', point_adjustment: '-35.00' });

  assert.equal(await balance(), '20.00');
  assert.equal(await recordTotal(1), '120.00');

  const [adjusts] = await pool.query("SELECT points FROM reward_transactions WHERE record_id = 1 AND txn_type = 'ADJUST'");
  assert.deepEqual(adjusts.map((a) => a.points), ['-35.00']);

  const [[log]] = await pool.query('SELECT changed_by_id, old_status, new_status, note FROM request_status_logs WHERE request_id = 1 ORDER BY log_id DESC LIMIT 1');
  assert.deepEqual(log, { changed_by_id: 1, old_status: 'Completed', new_status: 'Completed', note: 'Weight corrected from 15.50 kg to 12.00 kg' });

  const [[rec]] = await pool.query('SELECT actual_weight_kg, remarks FROM collection_records WHERE record_id = 1');
  assert.deepEqual(rec, { actual_weight_kg: '12.00', remarks: 'Admin audited the scale ticket.' });

  const h = await api.call('GET', '/rewards/history', { cookie: tanvir });
  assert.equal(h.body.data.transactions[0].reference, 'Weight correction, Pickup Job #1');
});

test('a second, upward correction keeps the total equal to ROUND(final kg × rate, 2)', async () => {
  const r = await correct(1, { actual_weight_kg: 13.33 }); // 133.30 − 120.00 = +13.30
  assert.equal(r.status, 200);
  assert.equal(r.body.data.point_adjustment, '13.30');
  assert.equal(await recordTotal(1), '133.30');
  assert.equal(await balance(), '33.30');

  // Remarks were not sent, so they stay as they were
  const [[rec]] = await pool.query('SELECT remarks FROM collection_records WHERE record_id = 1');
  assert.equal(rec.remarks, 'Admin audited the scale ticket.');
});

test('a correction that would make the balance negative is refused and changes nothing (EC-01)', async () => {
  // 1.00 kg → 10.00 points; delta −123.30, but the balance is only 33.30
  const r = await correct(1, { actual_weight_kg: 1 });
  assert.equal(r.status, 422);
  assert.equal(r.body.message, "Weight correction denied: the user's balance would drop below 0.00.");

  assert.equal(await balance(), '33.30');
  const [[rec]] = await pool.query('SELECT actual_weight_kg FROM collection_records WHERE record_id = 1');
  assert.equal(rec.actual_weight_kg, '13.33');
  const [adjusts] = await pool.query("SELECT COUNT(*) AS n FROM reward_transactions WHERE record_id = 1 AND txn_type = 'ADJUST'");
  assert.equal(Number(adjusts[0].n), 2);
});

test('the same weight again is a 400', async () => {
  const r = await correct(1, { actual_weight_kg: '13.33' });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'actual_weight_kg');
});

test('only completed collections can be corrected', async () => {
  // Seed request 2 is Accepted by Rafiqul: weigh it, but do not complete it
  const w = await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { request_id: 2, actual_weight_kg: 4 } });
  assert.equal(w.status, 201);
  const r = await correct(w.body.data.record_id, { actual_weight_kg: 5 });
  assert.equal(r.status, 409);
  assert.match(r.body.message, /Collected/);
});

test('validation, unknown record and roles', async () => {
  let r = await correct(1, { actual_weight_kg: 0 });
  assert.equal(r.status, 400);
  r = await correct(1, { actual_weight_kg: 5, remarks: 'x'.repeat(1001) });
  assert.equal(r.status, 400);
  r = await correct(99999, { actual_weight_kg: 5 });
  assert.equal(r.status, 404);
  r = await correct('abc', { actual_weight_kg: 5 });
  assert.equal(r.status, 404);

  r = await correct(1, { actual_weight_kg: 5 }, tanvir);
  assert.equal(r.status, 403);
  r = await api.call('GET', '/admin/collection-records', { cookie: rafiqul });
  assert.equal(r.status, 403);
});

test('a newly completed job can be corrected too', async () => {
  const created = await api.call('POST', '/pickup-requests', {
    cookie: tanvir,
    body: { category_id: 2, zone_id: 1, pickup_address: 'House 14', contact_phone: '01811000004', estimated_weight_kg: 10, preferred_at: bdDateTime(1) }
  });
  const id = created.body.data.request_id;
  await api.call('PUT', `/admin/pickup-requests/${id}/assign`, { cookie: admin, body: { collector_id: 2 } });
  await api.call('PUT', `/collector/requests/${id}/accept`, { cookie: rafiqul });
  const w = await api.call('POST', '/collector/collection-records', { cookie: rafiqul, body: { request_id: id, actual_weight_kg: 10 } });
  await api.call('PUT', `/collector/requests/${id}/complete`, { cookie: rafiqul }); // 10 × 6.00 = 60.00

  const r = await correct(w.body.data.record_id, { actual_weight_kg: 10.5 }); // 63.00 − 60.00
  assert.equal(r.status, 200);
  assert.equal(r.body.data.point_adjustment, '3.00');
});
