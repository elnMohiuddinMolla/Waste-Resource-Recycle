// API tests: rewards + cash redemption (api-spec.md Modules 5, 6 and §8.3–§8.4)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer } = require('./helpers');

let api;
let pool;
let tanvir; // user 4: seed balance 55.00 (155 EARN − 100 REDEEM)
let sadia;  // user 5: seed balance 0
let collector;
let admin;

before(async () => {
  await resetDatabase();
  api = startServer();
  pool = require('../../src/config/db').pool;
  tanvir = await api.login('tanvir@gmail.com');
  sadia = await api.login('sadia@gmail.com');
  collector = await api.login('collector1@wrr.com');
  admin = await api.login('admin@wrr.com');
});
after(async () => api && api.close());

// Test setup only: give a user points with an ADJUST row
async function givePoints(userId, points) {
  await pool.query("INSERT INTO reward_transactions (user_id, txn_type, points) VALUES (?, 'ADJUST', ?)", [userId, points]);
}

async function balanceOf(cookie) {
  const r = await api.call('GET', '/rewards/balance', { cookie });
  return r.body.data.available_balance;
}

const redeem = (cookie, points, method = 'bKash', account = '01811000005') =>
  api.call('POST', '/redemptions', { cookie, body: { points_redeemed: points, payout_method: method, payout_account: account } });

const decide = (id, body, cookie = admin) => api.call('PATCH', `/admin/redemptions/${id}`, { cookie, body });

// ---------- Rewards (Module 5) ----------

test('balance is SUM(points) with its cash value at the active rate', async () => {
  const r = await api.call('GET', '/rewards/balance', { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { user_id: 4, available_balance: '55.00', currency_equivalent_bdt: '27.50' });

  assert.equal((await api.call('GET', '/rewards/balance', { cookie: collector })).status, 403);
});

test('ledger history lists signed rows, newest first, with a readable reference', async () => {
  const r = await api.call('GET', '/rewards/history', { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 2);
  assert.deepEqual(r.body.data.transactions.map((t) => [t.txn_type, t.points, t.reference]), [
    ['REDEEM', '-100.00', 'Cash Redemption #1 (bKash)'],
    ['EARN', '155.00', 'Pickup Job #1 (15.50 kg Plastic)']
  ]);
});

test('active rule is visible to users and admins only', async () => {
  let r = await api.call('GET', '/redemptions/rules/active', { cookie: tanvir });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.taka_per_point, '0.5000');
  assert.equal(r.body.data.min_points, '100.00');
  r = await api.call('GET', '/redemptions/rules/active', { cookie: admin });
  assert.equal(r.status, 200);
  r = await api.call('GET', '/redemptions/rules/active', { cookie: collector });
  assert.equal(r.status, 403);
});

// ---------- Submit (FR-15) ----------

test('submit validates points, method and account', async () => {
  let r = await redeem(tanvir, 0, 'PayPal', 'x');
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['payout_method', 'points_redeemed']);

  r = await redeem(tanvir, 100, 'Nagad', '12345');
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'payout_account');

  r = await redeem(tanvir, 100, 'Bank', '01811000004x');
  assert.equal(r.status, 400);
});

test('below min_points or above the balance gives 422', async () => {
  let r = await redeem(tanvir, 50);
  assert.equal(r.status, 422);
  assert.match(r.body.message, /at least 100\.00 points/);

  r = await redeem(tanvir, 100);
  assert.equal(r.status, 422);
  assert.equal(r.body.message, 'Insufficient points balance. Available: 55.00, Requested: 100.00.');
  assert.equal(await balanceOf(tanvir), '55.00');
});

test('a valid redemption holds the points with a REDEEM row', async () => {
  await givePoints(5, 300);
  const r = await redeem(sadia, 100);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.points_redeemed, '100.00');
  assert.equal(r.body.data.cash_amount, '50.00');
  assert.equal(r.body.data.status, 'Pending');
  assert.equal(await balanceOf(sadia), '200.00');

  const id = r.body.data.redemption_id;
  const [[rt]] = await pool.query("SELECT points FROM reward_transactions WHERE redemption_id = ? AND txn_type = 'REDEEM'", [id]);
  assert.equal(rt.points, '-100.00');
  const [[n]] = await pool.query('SELECT type FROM notifications WHERE redemption_id = ?', [id]);
  assert.equal(n.type, 'REDEMPTION_REQUESTED');

  const mine = await api.call('GET', '/redemptions/mine', { cookie: sadia });
  assert.equal(mine.body.data[0].redemption_id, id);
  assert.equal(mine.body.data[0].status, 'Pending');
});

test('two redemptions at the same moment cannot spend the same points', async () => {
  assert.equal(await balanceOf(sadia), '200.00');
  const results = await Promise.all([redeem(sadia, 150), redeem(sadia, 150)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 422]);
  assert.equal(await balanceOf(sadia), '50.00');
});

test('a Bank account number is accepted for Bank payouts', async () => {
  await givePoints(5, 100);
  const r = await redeem(sadia, 100, 'Bank', '1234-5678-9012');
  assert.equal(r.status, 201);
});

// ---------- Admin processing (FR-21) ----------

test('admin queue lists redemptions by status; non-admins are refused', async () => {
  let r = await api.call('GET', '/admin/redemptions?status=Pending', { cookie: admin });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.total >= 3);
  assert.ok(r.body.data.redemptions.every((x) => x.status === 'Pending'));
  assert.equal(r.body.data.redemptions[0].user_name, 'Sadia Sultana');

  r = await api.call('GET', '/admin/redemptions?status=Done', { cookie: admin });
  assert.equal(r.status, 400);
  r = await api.call('GET', '/admin/redemptions', { cookie: sadia });
  assert.equal(r.status, 403);
});

test('approve then paid stores the TrxID; paid cannot be rejected', async () => {
  await givePoints(5, 100);
  const id = (await redeem(sadia, 100)).body.data.redemption_id;

  let r = await decide(id, { action: 'paid', payout_trx_id: 'BK1234567' });
  assert.equal(r.status, 409); // must be approved first

  r = await decide(id, { action: 'approve' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Approved');
  r = await decide(id, { action: 'approve' });
  assert.equal(r.status, 409);

  r = await decide(id, { action: 'paid' });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'payout_trx_id');

  r = await decide(id, { action: 'paid', payout_trx_id: 'BK1234567', admin_note: 'Sent from merchant wallet' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { redemption_id: id, status: 'Paid', payout_trx_id: 'BK1234567' });

  const before = await balanceOf(sadia);
  r = await decide(id, { action: 'reject', admin_note: 'Changed my mind' });
  assert.equal(r.status, 409);
  assert.equal(await balanceOf(sadia), before); // no refund after payment

  const [[row]] = await pool.query('SELECT admin_id, processed_at FROM cash_redemptions WHERE redemption_id = ?', [id]);
  assert.equal(row.admin_id, 1);
  assert.ok(row.processed_at);
  const [notes] = await pool.query('SELECT type FROM notifications WHERE redemption_id = ? ORDER BY notification_id', [id]);
  assert.deepEqual(notes.map((x) => x.type), ['REDEMPTION_REQUESTED', 'REDEMPTION_APPROVED', 'REDEMPTION_PAID']);
});

test('reject needs a note and refunds the points (from Pending or Approved)', async () => {
  await givePoints(5, 200);
  const start = await balanceOf(sadia);
  const a = (await redeem(sadia, 100)).body.data.redemption_id;
  const b = (await redeem(sadia, 100)).body.data.redemption_id;

  let r = await decide(a, { action: 'reject' });
  assert.equal(r.status, 400);
  assert.equal(r.body.errors[0].field, 'admin_note');

  r = await decide(a, { action: 'reject', admin_note: 'Invalid bKash wallet number.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'Rejected');

  await decide(b, { action: 'approve' });
  r = await decide(b, { action: 'reject', admin_note: 'Account name does not match.' });
  assert.equal(r.status, 200);

  assert.equal(await balanceOf(sadia), start); // both refunded

  const [refunds] = await pool.query("SELECT points FROM reward_transactions WHERE redemption_id IN (?, ?) AND txn_type = 'REFUND'", [a, b]);
  assert.deepEqual(refunds.map((x) => x.points), ['100.00', '100.00']);

  r = await decide(a, { action: 'reject', admin_note: 'Second time' });
  assert.equal(r.status, 409); // Rejected is final
  r = await decide(a, { action: 'approve' });
  assert.equal(r.status, 409);

  const [[n]] = await pool.query("SELECT message FROM notifications WHERE redemption_id = ? AND type = 'REDEMPTION_REJECTED'", [a]);
  assert.match(n.message, /Invalid bKash wallet number\. 100\.00 points were refunded/);
});

test('bad action, unknown id and non-admin are refused', async () => {
  let r = await decide(1, { action: 'delete' });
  assert.equal(r.status, 400);
  r = await decide(99999, { action: 'approve' });
  assert.equal(r.status, 404);
  r = await decide(1, { action: 'approve' }, tanvir);
  assert.equal(r.status, 403);
});

test('without an active rule, redemption is not possible', async () => {
  await pool.query('UPDATE redemption_rules SET is_active = FALSE');
  try {
    let r = await api.call('GET', '/redemptions/rules/active', { cookie: tanvir });
    assert.equal(r.status, 404);
    await givePoints(5, 100);
    r = await redeem(sadia, 100);
    assert.equal(r.status, 422);
    r = await api.call('GET', '/rewards/balance', { cookie: sadia });
    assert.equal(r.body.data.currency_equivalent_bdt, null);
  } finally {
    await pool.query('UPDATE redemption_rules SET is_active = TRUE WHERE rule_id = 1');
  }
});
