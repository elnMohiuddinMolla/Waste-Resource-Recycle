// API tests: admin redemption rules (api-spec.md §8.8, PRD FR-16, requirement-validation EC-06)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer } = require('./helpers');

let api;
let pool;
let admin;
let sadia; // user 5, starts with 0 points
let rafiqul;
let pendingId; // a redemption created under the seed rule

before(async () => {
  await resetDatabase();
  api = startServer();
  pool = require('../../src/config/db').pool;
  admin = await api.login('admin@wrr.com');
  sadia = await api.login('sadia@gmail.com');
  rafiqul = await api.login('collector1@wrr.com');
  // Test setup only: give Sadia 300 points
  await pool.query("INSERT INTO reward_transactions (user_id, txn_type, points) VALUES (5, 'ADJUST', 300)");
});
after(async () => api && api.close());

const newRule = (body, cookie = admin) => api.call('POST', '/admin/redemption-rules', { cookie, body });
const redeem = (points) => api.call('POST', '/redemptions', {
  cookie: sadia, body: { points_redeemed: points, payout_method: 'bKash', payout_account: '01811000005' }
});
const activeCount = async () => {
  const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM redemption_rules WHERE is_active = TRUE');
  return Number(row.n);
};

test('GET shows the active rule and an empty archive at first', async () => {
  const r = await api.call('GET', '/admin/redemption-rules', { cookie: admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.active.rule_id, 1);
  assert.equal(r.body.data.active.taka_per_point, '0.5000');
  assert.equal(r.body.data.active.min_points, '100.00');
  assert.equal(r.body.data.active.updated_by_name, 'System Administrator');
  assert.deepEqual(r.body.data.archived, []);
});

test('a redemption made under the old rule keeps its amount after the rule changes', async () => {
  const before = await redeem(100); // 100 × 0.50 = 50.00 BDT under rule 1
  assert.equal(before.status, 201);
  pendingId = before.body.data.redemption_id;

  let r = await newRule({ taka_per_point: 0.6, min_points: 100 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.taka_per_point, '0.6000');
  assert.equal(r.body.data.is_active, true);
  assert.equal(r.body.data.updated_by, 1);

  r = await newRule({ taka_per_point: '0.75', min_points: 50 });
  assert.equal(r.status, 201);
  const latestId = r.body.data.rule_id;

  assert.equal(await activeCount(), 1);
  r = await api.call('GET', '/admin/redemption-rules', { cookie: admin });
  assert.equal(r.body.data.active.rule_id, latestId);
  assert.deepEqual(r.body.data.archived.map((x) => x.is_active), [false, false]);
  assert.equal(r.body.data.archived.at(-1).rule_id, 1); // oldest last

  // The pending redemption still points at rule 1 and is paid at 50.00 BDT
  const [[old]] = await pool.query('SELECT rule_id, cash_amount FROM cash_redemptions WHERE redemption_id = ?', [pendingId]);
  assert.deepEqual(old, { rule_id: 1, cash_amount: '50.00' });
  await api.call('PATCH', `/admin/redemptions/${pendingId}`, { cookie: admin, body: { action: 'approve' } });
  r = await api.call('PATCH', `/admin/redemptions/${pendingId}`, { cookie: admin, body: { action: 'paid', payout_trx_id: 'BK7777' } });
  assert.equal(r.status, 200);
  const [[paid]] = await pool.query('SELECT cash_amount FROM cash_redemptions WHERE redemption_id = ?', [pendingId]);
  assert.equal(paid.cash_amount, '50.00');
});

test('new redemptions use the new rate and minimum', async () => {
  let r = await api.call('GET', '/redemptions/rules/active', { cookie: sadia });
  assert.equal(r.body.data.taka_per_point, '0.7500');
  assert.equal(r.body.data.min_points, '50.00');

  r = await redeem(60); // allowed now (min 50); 60 × 0.75 = 45.00
  assert.equal(r.status, 201);
  assert.equal(r.body.data.cash_amount, '45.00');
  r = await redeem(40); // below the new minimum
  assert.equal(r.status, 422);
});

test('two admins switching the rule at the same moment still leave one active rule', async () => {
  const results = await Promise.all([
    newRule({ taka_per_point: 0.8, min_points: 100 }),
    newRule({ taka_per_point: 0.9, min_points: 100 })
  ]);
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
  assert.equal(await activeCount(), 1);
});

test('validation', async () => {
  for (const bad of [0, -1, 0.12345, '1e-7', 'abc', null, 1000000]) {
    const r = await newRule({ taka_per_point: bad, min_points: 100 });
    assert.equal(r.status, 400, `taka_per_point ${bad}`);
    assert.equal(r.body.errors[0].field, 'taka_per_point');
  }
  let r = await newRule({ taka_per_point: 0.5, min_points: -5 });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'min_points');
  r = await newRule({ taka_per_point: 0.5, min_points: 0 }); // 0 is allowed
  assert.equal(r.status, 201);
  assert.equal(await activeCount(), 1);
});

test('only admins manage rules', async () => {
  let r = await api.call('GET', '/admin/redemption-rules', { cookie: sadia });
  assert.equal(r.status, 403);
  r = await newRule({ taka_per_point: 5, min_points: 1 }, rafiqul);
  assert.equal(r.status, 403);
  r = await api.call('POST', '/admin/redemption-rules', { body: { taka_per_point: 5, min_points: 1 } });
  assert.equal(r.status, 401);
});
