// API tests: admin reports (api-spec.md §8.10, PRD FR-17, database.md §6 Queries 2–6)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, startServer } = require('./helpers');

let api;
let admin;
let tanvir;
let kamal; // collector 3

// Wide range so rows written "today" by these tests are always included
const ALL = '?from=2026-01-01&to=2030-12-31';

before(async () => {
  await resetDatabase();
  api = startServer();
  admin = await api.login('admin@wrr.com');
  tanvir = await api.login('tanvir@gmail.com');
  kamal = await api.login('collector2@wrr.com');
});
after(async () => api && api.close());

const report = (type, query = '', cookie = admin) => api.call('GET', `/admin/reports/${type}${query}`, { cookie });

test('Report 1: weight by zone and category, with the last day included', async () => {
  // Seed record 1 was completed at 2026-11-10 11:05, so a one-day range must include it
  let r = await report('weight-by-category', '?from=2026-11-10&to=2026-11-10');
  assert.equal(r.status, 200);
  assert.equal(r.body.report_type, 'weight-by-category');
  assert.deepEqual(r.body.filters, { from: '2026-11-10', to: '2026-11-10', zone_id: null, category_id: null });
  assert.deepEqual(r.body.data, [
    { zone_name: 'Zone 1 - Baitul Aman', category_name: 'Plastic', total_pickups: 1, total_weight_kg: '15.50' }
  ]);

  r = await report('weight-by-category', '?from=2026-11-10&to=2026-11-10&category_id=2');
  assert.deepEqual(r.body.data, []);
  r = await report('weight-by-category', '?from=2026-11-10&to=2026-11-10&zone_id=3');
  assert.deepEqual(r.body.data, []);
  r = await report('weight-by-category', '?from=2026-11-11&to=2026-11-30');
  assert.deepEqual(r.body.data, []);
});

test('Report 2: request volume by status; percentages add up to 100', async () => {
  const r = await report('request-volume-by-status', '?from=2026-11-01&to=2026-11-30');
  assert.equal(r.status, 200);
  const byStatus = Object.fromEntries(r.body.data.map((x) => [x.status, x.request_count]));
  assert.deepEqual(byStatus, { Completed: 1, Accepted: 1, Pending: 1 });
  const total = r.body.data.reduce((sum, x) => sum + Number(x.percentage), 0);
  assert.ok(Math.abs(total - 100) < 0.05, `percentages sum to ${total}`);

  const z1 = await report('request-volume-by-status', '?from=2026-11-01&to=2026-11-30&zone_id=1');
  assert.equal(z1.body.data.reduce((s, x) => s + x.request_count, 0), 2);
  assert.equal('category_id' in z1.body.filters, false); // not used by this report
});

test('Report 3: collector performance with rejection rate from the logs', async () => {
  // Kamal is assigned seed request 3 and rejects it: 1 rejection out of 1 decision
  await api.call('PUT', '/admin/pickup-requests/3/assign', { cookie: admin, body: { collector_id: 3 } });
  const rej = await api.call('PUT', '/collector/requests/3/reject', { cookie: kamal, body: { reason: 'Vehicle breakdown.' } });
  assert.equal(rej.status, 200);

  const r = await report('collector-performance', ALL);
  assert.equal(r.status, 200);
  const rafiqul = r.body.data.find((c) => c.collector_id === 2);
  assert.deepEqual(rafiqul, {
    collector_id: 2, collector_name: 'Rafiqul Islam', primary_zone: 'Zone 1 - Baitul Aman',
    completed_pickups: 1, total_kg_collected: '15.50', rejection_count: 0, rejection_rate_percentage: '0.00'
  });
  const k = r.body.data.find((c) => c.collector_id === 3);
  assert.equal(k.rejection_count, 1);
  assert.equal(k.rejection_rate_percentage, '100.00');
  assert.equal(k.completed_pickups, 0);
});

test('Report 4: all-time points liability (dates are ignored)', async () => {
  const r = await report('point-liability', '?from=2030-01-01&to=2030-01-31');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.filters, {});
  assert.deepEqual(r.body.data, [{
    total_points_issued: '155.00',
    total_points_redeemed: '100.00',
    total_points_refunded: '0.00',
    total_points_adjusted: '0.00',
    net_outstanding_point_liability: '55.00',
    estimated_cash_liability_bdt: '27.50'
  }]);
});

test('Report 5: redemptions by status', async () => {
  let r = await report('redemption-summary', '?from=2026-11-01&to=2026-11-30');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, [{ status: 'Paid', redemption_count: 1, total_points: '100.00', total_cash_bdt: '50.00' }]);
  r = await report('redemption-summary', '?from=2026-12-01&to=2026-12-31');
  assert.deepEqual(r.body.data, []);
});

test('default dates are this month in Bangladesh time', async () => {
  const r = await report('redemption-summary');
  assert.equal(r.status, 200);
  assert.match(r.body.filters.from, /^\d{4}-\d{2}-01$/);
  assert.match(r.body.filters.to, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.body.filters.from.slice(0, 7), r.body.filters.to.slice(0, 7));
});

test('bad filters, unknown report and roles', async () => {
  assert.equal((await report('weight-by-category', '?from=2026-02-31')).status, 400);
  assert.equal((await report('weight-by-category', '?from=2026-11-30&to=2026-11-01')).status, 400);
  assert.equal((await report('weight-by-category', '?zone_id=abc')).status, 400);

  const unknown = await report('profit-and-loss');
  assert.equal(unknown.status, 404);
  assert.match(unknown.body.message, /weight-by-category/);

  assert.equal((await report('point-liability', '', tanvir)).status, 403);
  assert.equal((await api.call('GET', '/admin/reports/point-liability')).status, 401);
});
