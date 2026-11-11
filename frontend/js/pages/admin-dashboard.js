// Admin dashboard (prompt.md C9, PRD §4.3 step 1). Admins get no notification rows
// (FR-14); the queue counts are their alerts. This month's numbers and the two small
// bar charts come from the existing report endpoints (default dates = this month).
import { api, query } from '../api.js';
import { startDashboard } from './dashboard-shell.js';
import { el, $, clear, formatPoints, formatTaka, formatDate, statusBadge, emptyNode } from '../ui.js';

await startDashboard('admin', [
  ['Requests', 'Assign collectors to pickups.', '/admin/requests.html', 'truck'],
  ['Redemptions', 'Approve, pay or reject cash-outs.', '/admin/redemptions.html', 'cash'],
  ['Users', 'Activate or deactivate accounts.', '/admin/users.html', 'users'],
  ['Collectors', 'Create collectors, set their zones.', '/admin/collectors.html', 'truck'],
  ['Zones', 'Manage operating zones.', '/admin/zones.html', 'map'],
  ['Categories', 'Waste types and points per kg.', '/admin/categories.html', 'tag'],
  ['Redemption rules', 'Taka per point and the minimum.', '/admin/rules.html', 'sliders'],
  ['Collection records', 'Review and correct weights.', '/admin/records.html', 'clipboard'],
  ['Reports', 'Five reports, print and CSV.', '/admin/reports.html', 'chart'],
  ['Support tickets', 'Answer questions from users and collectors.', '/admin/support.html', 'help']
]);

// The "total" of a paged list, asking for just one row
async function total(path, params) {
  const r = await api(`${path}${query({ ...params, limit: 1 })}`);
  return r.ok ? r.body.data.total : null;
}

const set = (id, value) => { $(id).textContent = value; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- Queues ----------

async function loadQueues() {
  const [pending, rejected, redPending, redApproved, collectors, tickets] = await Promise.all([
    total('/admin/pickup-requests', { status: 'Pending' }),
    total('/admin/pickup-requests', { status: 'Rejected' }),
    total('/admin/redemptions', { status: 'Pending' }),
    total('/admin/redemptions', { status: 'Approved' }),
    total('/admin/users', { role: 'collector', status: 'active' }),
    total('/admin/support-tickets', { status: 'Open' })
  ]);
  const queues = [['#kpi-pending', pending], ['#kpi-rejected', rejected], ['#kpi-red-pending', redPending], ['#kpi-red-approved', redApproved], ['#kpi-tickets', tickets]];
  for (const [id, n] of queues) {
    set(id, n ?? '—');
    const card = $(id).closest('.db-queue');
    card.classList.toggle('is-busy', n > 0);
    card.classList.toggle('is-clear', n === 0);
  }
  set('#kpi-collectors', collectors ?? '—');

  const waiting = queues.reduce((sum, [, n]) => sum + (n || 0), 0);
  // Name only what is actually waiting, e.g. "2 requests are waiting for you."
  const parts = [];
  const requests = (pending || 0) + (rejected || 0);
  const cashOuts = (redPending || 0) + (redApproved || 0);
  if (requests) parts.push(plural(requests, 'request'));
  if (cashOuts) parts.push(plural(cashOuts, 'redemption'));
  if (tickets) parts.push(plural(tickets, 'support ticket'));
  set('#attention', waiting === 0
    ? 'All clear — nothing is waiting for you right now.'
    : `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]} ${waiting === 1 ? 'is' : 'are'} waiting for you.`);
}

// ---------- Bar charts (native <progress>, no chart library) ----------

function bars(box, rows, emptyText) {
  clear(box);
  if (!rows.length) return box.append(emptyNode(emptyText));
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  box.append(el('ul', { className: 'db-bars' }, rows.map((r) => el('li', {}, [
    el('span', { className: 'db-bar-label' }, [r.label]),
    el('progress', { className: 'db-bar', attrs: { max, value: r.value, 'aria-label': `${r.text}` } }),
    el('span', { className: 'db-bar-value', text: r.text })
  ]))));
}

async function loadMonth() {
  const [weight, status, redemptions, liability] = await Promise.all([
    api('/admin/reports/weight-by-category'),
    api('/admin/reports/request-volume-by-status'),
    api('/admin/reports/redemption-summary'),
    api('/admin/reports/point-liability')
  ]);

  if (weight.ok) {
    const f = weight.body.filters;
    set('#month-range', `${formatDate(f.from)} – ${formatDate(f.to)}`);
    const rows = weight.body.data;
    const kg = rows.reduce((s, r) => s + Number(r.total_weight_kg), 0);
    const pickups = rows.reduce((s, r) => s + r.total_pickups, 0);
    set('#kpi-kg', `${kg.toFixed(2).replace(/\.00$/, '')} kg`);
    set('#kpi-kg-note', `Collected in ${plural(pickups, 'pickup')}`);
    // Weight per category across all zones
    const byCat = {};
    for (const r of rows) byCat[r.category_name] = (byCat[r.category_name] || 0) + Number(r.total_weight_kg);
    bars($('#chart-category'), Object.entries(byCat).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ label: name, value, text: `${value.toFixed(2)} kg` })), 'Nothing collected yet this month.');
  }

  if (status.ok) {
    bars($('#chart-status'), status.body.data.map((r) => ({
      label: statusBadge(r.status), value: r.request_count, text: `${r.request_count} · ${Number(r.percentage).toFixed(0)}%`
    })), 'No requests this month.');
  }

  if (redemptions.ok) {
    const paid = redemptions.body.data.find((r) => r.status === 'Paid');
    set('#kpi-paid', formatTaka(paid ? paid.total_cash_bdt : 0));
    set('#kpi-paid-note', `Paid out · ${plural(paid ? paid.redemption_count : 0, 'redemption')}`);
  }

  if (liability.ok) {
    const row = liability.body.data[0];
    set('#kpi-liability', `${formatPoints(row.net_outstanding_point_liability)} pts`);
    set('#kpi-liability-bdt', row.estimated_cash_liability_bdt === null
      ? 'Not yet redeemed'
      : `Unredeemed · ≈ ${formatTaka(row.estimated_cash_liability_bdt).replace(' ', ' ')}`);
  }
}

async function loadAll() {
  const btn = $('#refresh');
  btn.disabled = true;
  await Promise.all([loadQueues(), loadMonth()]);
  btn.disabled = false;
}

$('#refresh').addEventListener('click', loadAll);
await loadAll();
