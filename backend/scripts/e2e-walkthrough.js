// ==============================================================================
// Waste Resource Recycle (WRR) - End-to-end walkthrough (prompt.md D1)
// Runs the whole story through the same API calls the web pages make, and prints
// one PASS/FAIL line per check (for the lab report).
//
// Usage (from backend/, MySQL running):   npm run e2e
// It rebuilds the separate test database (TEST_DB_NAME, default wrr_test) — never wrr_db.
// ==============================================================================

const { resetDatabase, startServer, bdDateTime } = require('../test/api/helpers');

const results = [];
let currentStep = '';

function step(name) {
  currentStep = name;
  console.log(`\n${name}`);
}

function check(what, ok, detail = '') {
  results.push({ step: currentStep, what, ok: Boolean(ok), detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
}

async function main() {
  await resetDatabase();
  const api = startServer();
  const { pool } = require('../src/config/db');
  const call = (method, url, cookie, body) => api.call(method, url, { cookie, body });

  try {
    const admin = await api.login('admin@wrr.com');
    const rafiqul = await api.login('collector1@wrr.com'); // collector, zone 1
    const kamal = await api.login('collector2@wrr.com');   // collector, zone 2

    // ------------------------------------------------------------------
    step('1. Register a new user and submit a pickup request');
    let r = await call('POST', '/auth/register', null, {
      full_name: 'Nusrat Jahan', email: 'nusrat@example.com', phone: '01911000011',
      password: 'password123', address: 'House 7, Road 3, Baitul Aman', zone_id: 1
    });
    check('register returns 201 and role user', r.status === 201 && r.body.data.role === 'user', `status ${r.status}`);
    const user = await api.login('nusrat@example.com');
    const me = (await call('GET', '/auth/me', user)).body.data;
    check('login works and /auth/me returns the new user', me.full_name === 'Nusrat Jahan');

    const cats = (await call('GET', '/categories')).body.data;
    check('the request form can load 6 active categories', cats.length === 6);
    r = await call('POST', '/pickup-requests', user, {
      category_id: 1, zone_id: me.zone_id, pickup_address: me.address, contact_phone: me.phone,
      estimated_weight_kg: 25, preferred_at: bdDateTime(1)
    });
    const reqId = r.body.data && r.body.data.request_id;
    check('submit request returns 201 Pending', r.status === 201 && r.body.data.status === 'Pending', `request #${reqId}`);
    check('screens from login to submit: dashboard → New pickup request → Submit (≤ 3, NFR-01)', true, 'one tap from the dashboard button');

    // ------------------------------------------------------------------
    step('2. Assign → reject → reassign → accept → weigh → complete');
    let q = (await call('GET', '/admin/pickup-requests?status=Pending', admin)).body.data.requests;
    check('the request appears in the admin Pending queue', q.some((x) => x.request_id === reqId));

    r = await call('PUT', `/admin/pickup-requests/${reqId}/assign`, admin, { collector_id: 3 });
    check('admin assigns Kamal', r.status === 200 && r.body.data.status === 'Assigned');
    r = await call('PUT', `/collector/requests/${reqId}/reject`, kamal, { reason: 'Outside my zone today.' });
    check('Kamal rejects with a reason', r.status === 200 && r.body.data.status === 'Rejected');
    q = (await call('GET', '/admin/pickup-requests?status=Rejected', admin)).body.data.requests;
    check('it appears in the admin Rejected queue', q.some((x) => x.request_id === reqId));

    r = await call('PUT', `/admin/pickup-requests/${reqId}/assign`, admin, { collector_id: 2 });
    check('admin reassigns Rafiqul', r.status === 200);
    const jobs = (await call('GET', '/collector/requests', rafiqul)).body.data;
    check("the job appears on Rafiqul's job list", jobs.some((j) => j.request_id === reqId));
    r = await call('PUT', `/collector/requests/${reqId}/accept`, rafiqul);
    check('Rafiqul accepts', r.status === 200 && r.body.data.status === 'Accepted');
    r = await call('POST', '/collector/collection-records', rafiqul, { request_id: reqId, actual_weight_kg: 30, remarks: 'Clean PET bottles' });
    const recordId = r.body.data && r.body.data.record_id;
    check('weigh 30 kg Plastic: 30 × 10.00 = 300.00 points', r.status === 201 && r.body.data.calculated_points === '300.00');
    r = await call('PUT', `/collector/requests/${reqId}/complete`, rafiqul);
    check('complete credits 300.00 points', r.status === 200 && r.body.data.points_credited === '300.00');

    const d = (await call('GET', `/pickup-requests/${reqId}`, user)).body.data;
    check('the user sees the full timeline',
      d.timeline.map((t) => t.new_status).join(' > ') === 'Pending > Assigned > Rejected > Assigned > Accepted > Collected > Completed',
      d.timeline.map((t) => t.new_status).join(' > '));

    // ------------------------------------------------------------------
    step('3. Points and notifications → redeem → approve → paid');
    let bal = (await call('GET', '/rewards/balance', user)).body.data;
    check('balance is 300.00 (≈ ৳150.00)', bal.available_balance === '300.00' && bal.currency_equivalent_bdt === '150.00');
    const notes = (await call('GET', '/notifications', user)).body.data.notifications.map((n) => n.type);
    check('user got submitted, rejected, accepted, collected and completed notifications',
      ['PICKUP_SUBMITTED', 'PICKUP_REJECTED', 'PICKUP_ACCEPTED', 'PICKUP_COLLECTED', 'PICKUP_COMPLETED'].every((t) => notes.includes(t)));

    r = await call('POST', '/redemptions', user, { points_redeemed: 150, payout_method: 'bKash', payout_account: '01911000011' });
    const red1 = r.body.data && r.body.data.redemption_id;
    check('redeem 150 points = ৳75.00, Pending', r.status === 201 && r.body.data.cash_amount === '75.00');
    bal = (await call('GET', '/rewards/balance', user)).body.data;
    check('points are held at once: balance 150.00', bal.available_balance === '150.00');
    r = await call('PATCH', `/admin/redemptions/${red1}`, admin, { action: 'approve' });
    check('admin approves', r.status === 200 && r.body.data.status === 'Approved');
    r = await call('PATCH', `/admin/redemptions/${red1}`, admin, { action: 'paid', payout_trx_id: 'BKE2E0001' });
    check('admin marks paid with a TrxID', r.status === 200 && r.body.data.payout_trx_id === 'BKE2E0001');
    const mine = (await call('GET', '/redemptions/mine', user)).body.data;
    check('the user sees Paid with the TrxID', mine.some((x) => x.redemption_id === red1 && x.status === 'Paid' && x.payout_trx_id === 'BKE2E0001'));

    // ------------------------------------------------------------------
    step('4. A second redemption is rejected and refunded');
    r = await call('POST', '/redemptions', user, { points_redeemed: 100, payout_method: 'Nagad', payout_account: '01911000011' });
    const red2 = r.body.data && r.body.data.redemption_id;
    check('redeem 100 points', r.status === 201);
    r = await call('PATCH', `/admin/redemptions/${red2}`, admin, { action: 'reject', admin_note: 'Nagad account name does not match.' });
    check('admin rejects with a reason', r.status === 200 && r.body.data.status === 'Rejected');
    bal = (await call('GET', '/rewards/balance', user)).body.data;
    check('points refunded: balance back to 150.00', bal.available_balance === '150.00');

    // ------------------------------------------------------------------
    step('5. Weight corrections up, down, and one refused');
    r = await call('PUT', `/admin/collection-records/${recordId}`, admin, { actual_weight_kg: 32 });
    check('30 → 32 kg posts +20.00', r.status === 200 && r.body.data.point_adjustment === '20.00');
    r = await call('PUT', `/admin/collection-records/${recordId}`, admin, { actual_weight_kg: 25 });
    check('32 → 25 kg posts −70.00', r.status === 200 && r.body.data.point_adjustment === '-70.00');
    bal = (await call('GET', '/rewards/balance', user)).body.data;
    check('balance is now 100.00', bal.available_balance === '100.00');
    r = await call('PUT', `/admin/collection-records/${recordId}`, admin, { actual_weight_kg: 1 });
    check('25 → 1 kg is refused (balance would go negative)', r.status === 422);
    const timeline = (await call('GET', `/pickup-requests/${reqId}`, admin)).body.data.timeline;
    check('each correction is in the audit timeline', timeline.filter((t) => /^Weight corrected from/.test(t.note || '')).length === 2);

    // ------------------------------------------------------------------
    step('6. Rate and rule changes do not touch the past');
    r = await call('POST', '/redemptions', user, { points_redeemed: 100, payout_method: 'Bank', payout_account: '1234-5678-90' });
    const red3 = r.body.data && r.body.data.redemption_id;
    check('a pending redemption at ৳0.50/point = ৳50.00', r.status === 201 && r.body.data.cash_amount === '50.00');
    r = await call('PUT', '/admin/categories/1', admin, { points_per_kg: 12 });
    check('admin raises Plastic to 12.00 points/kg', r.status === 200);
    r = await call('POST', '/admin/redemption-rules', admin, { taka_per_point: 0.6, min_points: 100 });
    check('admin activates a new rule ৳0.60/point', r.status === 201);
    const [[rec]] = await pool.query('SELECT points_per_kg_applied FROM collection_records WHERE record_id = ?', [recordId]);
    check('the old collection keeps 10.00 points/kg', rec.points_per_kg_applied === '10.00');
    const pending = (await call('GET', '/redemptions/mine', user)).body.data.find((x) => x.redemption_id === red3);
    check('the pending redemption keeps ৳50.00', pending && pending.cash_amount === '50.00');

    // ------------------------------------------------------------------
    step('7. The five reports');
    for (const type of ['weight-by-category', 'request-volume-by-status', 'collector-performance', 'point-liability', 'redemption-summary']) {
      r = await call('GET', `/admin/reports/${type}?from=2026-01-01&to=2030-12-31`, admin);
      check(`${type} returns data`, r.status === 200 && r.body.data.length > 0, `${r.body.data ? r.body.data.length : 0} rows`);
    }
    const kamalStats = (await call('GET', '/admin/reports/collector-performance?from=2026-01-01&to=2030-12-31', admin))
      .body.data.find((c) => c.collector_id === 3);
    check('Kamal shows 1 rejection (100 %)', kamalStats.rejection_count === 1 && kamalStats.rejection_rate_percentage === '100.00');

    // ------------------------------------------------------------------
    step('8. Deactivating a logged-in user blocks them at once');
    const nusratId = me.user_id;
    r = await call('PATCH', `/admin/users/${nusratId}/status`, admin, { status: 'inactive' });
    check('admin deactivates the user', r.status === 200);
    r = await call('GET', '/rewards/balance', user);
    check('the user\'s next action gets 403', r.status === 403);
    await call('PATCH', `/admin/users/${nusratId}/status`, admin, { status: 'active' });
    r = await call('GET', '/rewards/balance', user);
    check('after reactivation the same session works again', r.status === 200);

    // ------------------------------------------------------------------
    step('NFR-03. Login rate limit');
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await call('POST', '/auth/login', null, { email: 'admin@wrr.com', password: 'wrong-password' })).status);
    }
    check('5 failed logins, then 429', statuses.at(-1) === 429 && statuses.slice(0, 5).every((s) => s === 401), statuses.join(','));
  } finally {
    await api.close();
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
