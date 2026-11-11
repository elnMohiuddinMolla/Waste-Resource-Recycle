// Admin dashboard (prompt.md C9, PRD §4.3 step 1). Admins get no notification rows
// (FR-14); these queue counts are their alerts. Only existing endpoints are used.
import { api, query } from '../api.js';
import { startDashboard } from './dashboard-shell.js';
import { $, formatPoints, formatTaka } from '../ui.js';

await startDashboard('admin', [
  ['Requests', 'Assign collectors to pending and rejected requests.', '/admin/requests.html'],
  ['Redemptions', 'Approve, pay or reject cash redemptions.', '/admin/redemptions.html'],
  ['Users', 'Activate or deactivate accounts.', '/admin/users.html'],
  ['Collectors', 'Create collector accounts and set their zones.', '/admin/collectors.html'],
  ['Zones', 'Manage operating zones.', '/admin/zones.html'],
  ['Categories', 'Waste categories and points per kg.', '/admin/categories.html'],
  ['Redemption rules', 'Taka per point and the minimum to redeem.', '/admin/rules.html'],
  ['Collection records', 'Review weights and correct mistakes.', '/admin/records.html'],
  ['Reports', 'Five management reports, printable and exportable.', '/admin/reports.html']
]);

// The "total" of a paged list, asking for just one row
async function total(path, params) {
  const r = await api(`${path}${query({ ...params, limit: 1 })}`);
  return r.ok ? r.body.data.total : '—';
}

function set(id, value) {
  $(id).textContent = value;
}

async function loadQueues() {
  const [pending, rejected, redPending, redApproved, collectors] = await Promise.all([
    total('/admin/pickup-requests', { status: 'Pending' }),
    total('/admin/pickup-requests', { status: 'Rejected' }),
    total('/admin/redemptions', { status: 'Pending' }),
    total('/admin/redemptions', { status: 'Approved' }),
    total('/admin/users', { role: 'collector', status: 'active' })
  ]);
  set('#kpi-pending', pending);
  set('#kpi-rejected', rejected);
  set('#kpi-red-pending', redPending);
  set('#kpi-red-approved', redApproved);
  set('#kpi-collectors', collectors);
}

async function loadReports() {
  const [weight, liability] = await Promise.all([
    api('/admin/reports/weight-by-category'), // defaults to this month
    api('/admin/reports/point-liability')
  ]);
  if (weight.ok) {
    const kg = weight.body.data.reduce((sum, row) => sum + Number(row.total_weight_kg), 0);
    const pickups = weight.body.data.reduce((sum, row) => sum + row.total_pickups, 0);
    set('#kpi-kg', `${kg.toFixed(2)} kg`);
    set('#kpi-kg-note', `${pickups} completed pickup${pickups === 1 ? '' : 's'} since ${weight.body.filters.from}`);
  }
  if (liability.ok) {
    const row = liability.body.data[0];
    set('#kpi-liability', `${formatPoints(row.net_outstanding_point_liability)} pts`);
    set('#kpi-liability-bdt', row.estimated_cash_liability_bdt === null
      ? 'No active rate'
      : `≈ ${formatTaka(row.estimated_cash_liability_bdt)} if all were redeemed`);
  }
}

async function loadAll() {
  await Promise.all([loadQueues(), loadReports()]);
}

$('#refresh').addEventListener('click', loadAll);
await loadAll();
