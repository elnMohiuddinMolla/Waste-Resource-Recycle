// ==============================================================================
// Waste Resource Recycle (WRR) - Performance check for NFR-02
// Core API calls must answer in <= 2 s and reports in <= 5 s with 50 concurrent users.
//
// Usage (from backend/, MySQL running):   node scripts/perf-check.js
// It rebuilds the separate test database (TEST_DB_NAME, default wrr_test) — never wrr_db —
// adds 50 users and 1,000 pickup requests with full history, then times every
// read endpoint, alone and with 50 calls at the same moment.
// ==============================================================================

const { resetDatabase, startServer, SAMPLE_PHOTO } = require('../test/api/helpers');

const USERS = 50;
const REQUESTS = 1000;
const CORE_LIMIT_MS = 2000;
const REPORT_LIMIT_MS = 5000;
const SEED_HASH = '$2a$10$avkNZrMj9vCRN098yEawa.vABOB4ZLk0Q9Bqz/LCfZj/qhojigwgG'; // password123

function pad(n) { return String(n).padStart(2, '0'); }
function dt(day, hour, min = 0) { return `2026-11-${pad(day)} ${pad(hour)}:${pad(min)}:00`; }

// Inserts rows in chunks of 500 with one multi-row INSERT each
async function bulkInsert(pool, table, columns, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const marks = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    await pool.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${marks}`, chunk.flat());
  }
}

async function addVolumeData(pool) {
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const id = 100 + i;
    users.push([id, `Load Test User ${i + 1}`, `load${i + 1}@example.com`, `0181${String(1000000 + i).slice(-7)}`,
      SEED_HASH, 'user', `House ${i + 1}, Test Road`, (i % 4) + 1, 'active']);
  }
  await bulkInsert(pool, 'users',
    ['user_id', 'full_name', 'email', 'phone', 'password_hash', 'role', 'address', 'zone_id', 'status'], users);

  const requests = []; const logs = []; const records = []; const ledger = []; const notes = [];
  const plan = ['Completed', 'Completed', 'Completed', 'Completed', 'Completed', 'Completed',
    'Pending', 'Assigned', 'Accepted', 'Cancelled'];

  for (let i = 0; i < REQUESTS; i++) {
    const id = 1000 + i;
    const userId = 100 + (i % USERS);
    const zoneId = ((i % USERS) % 4) + 1;
    const categoryId = (i % 5) + 1;
    const day = (i % 10) + 1;
    const status = plan[i % plan.length];
    const collectorId = status === 'Pending' || status === 'Cancelled' ? null : (i % 2) + 2;
    requests.push([id, userId, categoryId, zoneId, collectorId, `House ${i}, Test Road`, '01811000999',
      null, 5 + (i % 20), dt(day, 15), status, dt(day, 8)]);

    const steps = { Pending: ['Pending'], Cancelled: ['Pending', 'Cancelled'], Assigned: ['Pending', 'Assigned'],
      Accepted: ['Pending', 'Assigned', 'Accepted'],
      Completed: ['Pending', 'Assigned', 'Accepted', 'Collected', 'Completed'] }[status];
    steps.forEach((s, k) => logs.push([id, k === 0 || s === 'Cancelled' ? userId : (s === 'Assigned' ? 1 : collectorId),
      k === 0 ? null : steps[k - 1], s, 'load test', dt(day, 8 + k)]));

    if (status === 'Completed') {
      const recordId = 1000 + i;
      const kg = (1 + (i % 30) + 0.25).toFixed(2);
      const rate = [10, 6, 25, 15, 4][categoryId - 1];
      records.push([recordId, id, collectorId, kg, rate, dt(day, 11), dt(day, 12)]);
      ledger.push([userId, 'EARN', recordId, (Math.round(kg * rate * 100) / 100).toFixed(2), dt(day, 12)]);
      notes.push([userId, id, 'PICKUP_COMPLETED', `Pickup #${id} completed.`, i % 3 === 0 ? 0 : 1, dt(day, 12)]);
    }
    notes.push([userId, id, 'PICKUP_SUBMITTED', `Pickup #${id} submitted.`, 1, dt(day, 8)]);
  }

  await bulkInsert(pool, 'pickup_requests', ['request_id', 'user_id', 'category_id', 'zone_id', 'collector_id',
    'pickup_address', 'contact_phone', 'other_description', 'estimated_weight_kg', 'preferred_at', 'status', 'created_at'], requests);
  await bulkInsert(pool, 'request_status_logs', ['request_id', 'changed_by_id', 'old_status', 'new_status', 'note', 'changed_at'], logs);
  await bulkInsert(pool, 'collection_records', ['record_id', 'request_id', 'collector_id', 'actual_weight_kg',
    'points_per_kg_applied', 'collected_at', 'completed_at'], records);
  await bulkInsert(pool, 'reward_transactions', ['user_id', 'txn_type', 'record_id', 'points', 'created_at'], ledger);
  await bulkInsert(pool, 'notifications', ['user_id', 'request_id', 'type', 'message', 'is_read', 'created_at'], notes);

  return { users: USERS, requests: REQUESTS, logs: logs.length, records: records.length, notifications: notes.length };
}

async function timed(fn) {
  const start = performance.now();
  const r = await fn();
  return { ms: performance.now() - start, status: r.status };
}

async function main() {
  console.log('Rebuilding the test database...');
  await resetDatabase();
  const api = startServer();
  const { pool } = require('../src/config/db');
  try {
    const counts = await addVolumeData(pool);
    console.log('Added:', counts);

    const admin = await api.login('admin@wrr.com');
    const collector = await api.login('collector1@wrr.com');
    const userCookies = [];
    for (let i = 1; i <= USERS; i++) userCookies.push(await api.login(`load${i}@example.com`));
    const user = userCookies[0];
    const month = '?from=2026-11-01&to=2026-11-30';

    const checks = [
      ['core', 'GET /pickup-requests/mine', user, '/pickup-requests/mine'],
      ['core', 'GET /pickup-requests/:id', user, '/pickup-requests/1000'],
      ['core', 'GET /rewards/balance', user, '/rewards/balance'],
      ['core', 'GET /rewards/history', user, '/rewards/history'],
      ['core', 'GET /notifications', user, '/notifications'],
      ['core', 'GET /collector/requests', collector, '/collector/requests'],
      ['core', 'GET /collector/history', collector, '/collector/history'],
      ['core', 'GET /admin/pickup-requests', admin, '/admin/pickup-requests?status=Pending'],
      ['core', 'GET /admin/users', admin, '/admin/users'],
      ['core', 'GET /admin/collection-records', admin, '/admin/collection-records'],
      ['report', 'weight-by-category', admin, `/admin/reports/weight-by-category${month}`],
      ['report', 'request-volume-by-status', admin, `/admin/reports/request-volume-by-status${month}`],
      ['report', 'collector-performance', admin, `/admin/reports/collector-performance${month}`],
      ['report', 'point-liability', admin, '/admin/reports/point-liability'],
      ['report', 'redemption-summary', admin, `/admin/reports/redemption-summary${month}`]
    ];

    let failed = 0;
    console.log('\nEndpoint                         alone    50 at once (slowest)   limit   result');
    for (const [kind, name, cookie, url] of checks) {
      const alone = await timed(() => api.call('GET', url, { cookie }));
      // 50 concurrent calls; user endpoints use 50 different users
      const burst = await Promise.all(Array.from({ length: 50 }, (_, i) =>
        timed(() => api.call('GET', url, { cookie: cookie === user ? userCookies[i] : cookie }))));
      const slowest = Math.max(...burst.map((b) => b.ms));
      const statusOk = alone.status === 200 && burst.every((b) => b.status === 200 || (url.includes('/pickup-requests/1000') && b.status === 404));
      const limit = kind === 'report' ? REPORT_LIMIT_MS : CORE_LIMIT_MS;
      const ok = statusOk && alone.ms <= limit && slowest <= limit;
      if (!ok) failed++;
      console.log(`${name.padEnd(32)} ${alone.ms.toFixed(0).padStart(5)} ms   ${slowest.toFixed(0).padStart(7)} ms`
        + `            ${String(limit).padStart(5)}   ${ok ? 'PASS' : 'FAIL'}`);
    }

    // A write path under load: 50 users submit a request at the same moment
    const tomorrow = new Date(Date.now() + 30 * 3600 * 1000 + 6 * 3600 * 1000).toISOString().slice(0, 16);
    const writes = await Promise.all(userCookies.map((cookie) => timed(() => api.call('POST', '/pickup-requests', {
      cookie,
      body: { category_id: 1, zone_id: 1, pickup_address: 'House 1', contact_phone: '01811000999', estimated_weight_kg: 3, preferred_at: tomorrow, photo: SAMPLE_PHOTO }
    }))));
    const slowestWrite = Math.max(...writes.map((w) => w.ms));
    const writesOk = writes.every((w) => w.status === 201) && slowestWrite <= CORE_LIMIT_MS;
    if (!writesOk) failed++;
    console.log(`${'POST /pickup-requests (50 users)'.padEnd(32)}     -   ${slowestWrite.toFixed(0).padStart(7)} ms            ${String(CORE_LIMIT_MS).padStart(5)}   ${writesOk ? 'PASS' : 'FAIL'}`);

    console.log(failed === 0 ? '\nNFR-02: all checks passed.' : `\nNFR-02: ${failed} check(s) failed.`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    await api.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
