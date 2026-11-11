// User dashboard (prompt.md C3, PRD §4.1 step 2): balance with progress to the
// redemption minimum, request counts, next pickup, a tracker for the current pickup,
// unread notifications and the latest requests.
import { api, query } from '../api.js';
import { startDashboard, relativeTime } from './dashboard-shell.js';
import { onUnreadCount } from '../notifications.js';
import { icon } from '../icons.js';
import { el, $, clear, formatPoints, formatTaka, formatDateTime, statusBadge, loadingNode, emptyNode } from '../ui.js';

const ACTIVE = ['Pending', 'Assigned', 'Accepted', 'Collected'];
const STEPS = ['Pending', 'Assigned', 'Accepted', 'Collected', 'Completed'];
const STEP_TEXT = {
  Pending: 'Waiting for the admin to assign a collector.',
  Assigned: 'A collector has been assigned and will accept the job soon.',
  Accepted: 'The collector accepted and will call before arriving.',
  Collected: 'Your waste has been weighed. Points are credited when the job is completed.'
};

await startDashboard('user', [
  ['New pickup request', 'Book a collector for your recyclables.', '/user/new-request.html', 'plus'],
  ['My requests', 'Track each request and its timeline.', '/user/requests.html', 'list'],
  ['Points', 'Every point you earned and spent.', '/user/history.html', 'star'],
  ['Redeem', 'Turn your points into cash.', '/user/redeem.html', 'cash'],
  ['Notifications', 'Updates about pickups and payouts.', '/user/notifications.html', 'bell']
]);

// My requests with one status: { total, requests } (active ones are few, 50 is plenty)
async function byStatus(status, limit) {
  const r = await api(`/pickup-requests/mine${query({ status, limit })}`);
  return r.ok ? r.body.data : { total: 0, requests: [] };
}

// ---------- Balance and progress to the redemption minimum ----------

async function loadBalance() {
  const [bal, rule] = await Promise.all([api('/rewards/balance'), api('/redemptions/rules/active')]);
  if (!bal.ok) return;
  const balance = Number(bal.body.data.available_balance);
  $('#stat-balance').textContent = formatPoints(balance);
  const bdt = bal.body.data.currency_equivalent_bdt;
  $('#stat-bdt').textContent = bdt === null ? '' : `≈ ${formatTaka(bdt)} at today's rate`;

  const bar = $('#redeem-progress');
  const note = $('#redeem-note');
  if (!rule.ok) {
    bar.classList.add('hidden');
    note.textContent = 'Cash redemption is paused at the moment.';
    return;
  }
  const min = Number(rule.body.data.min_points);
  bar.max = min || 1;
  bar.value = Math.min(balance, min || 1);
  note.textContent = balance >= min
    ? 'You can redeem now →'
    : `${formatPoints(min - balance)} more points to cash out (minimum ${formatPoints(min)})`;
}

// ---------- Counts, next pickup and the tracker ----------

function renderTracker(req) {
  const box = clear($('#tracker'));
  if (!req) {
    box.append(el('div', { className: 'db-empty' }, [
      el('span', { className: 'db-empty-icon' }, [icon('truck')]),
      el('p', { text: 'No pickup in progress.' }),
      el('a', { text: 'Request a pickup', className: 'btn btn-primary btn-small', attrs: { href: '/user/new-request.html' } })
    ]));
    return;
  }
  $('#tracker-link').href = `/user/requests.html?id=${req.request_id}`;
  $('#tracker-link').textContent = 'View details';
  const current = STEPS.indexOf(req.status);
  box.append(
    el('div', { className: 'db-track-head' }, [
      el('div', {}, [
        el('strong', { text: `#${req.request_id} · ${req.category_name}` }),
        el('small', { text: `${formatDateTime(req.preferred_at)} · ${req.estimated_weight_kg} kg estimated` })
      ]),
      statusBadge(req.status)
    ]),
    el('ol', { className: 'db-track', attrs: { 'aria-label': 'Pickup progress' } }, STEPS.map((s, i) => el('li', {
      className: i < current ? 'done' : i === current ? 'current' : '',
      attrs: i === current ? { 'aria-current': 'step' } : {}
    }, [el('span', { className: 'db-track-dot' }, [i < current ? icon('check') : String(i + 1)]), el('span', { text: s })]))),
    el('p', { className: 'db-track-note', text: STEP_TEXT[req.status] + (req.collector_name ? ` Collector: ${req.collector_name}.` : '') })
  );
}

async function loadRequests() {
  const [completed, ...active] = await Promise.all([byStatus('Completed', 1), ...ACTIVE.map((s) => byStatus(s, 50))]);
  $('#stat-completed').textContent = completed.total;
  $('#stat-active').textContent = active.reduce((sum, a) => sum + a.total, 0);

  const open = active.flatMap((a) => a.requests);
  // The pickup to track: the one furthest along, then the newest
  open.sort((a, b) => STEPS.indexOf(b.status) - STEPS.indexOf(a.status) || b.request_id - a.request_id);
  renderTracker(open[0]);

  const upcoming = open.filter((r) => r.status !== 'Collected').sort((a, b) => a.preferred_at.localeCompare(b.preferred_at))[0];
  if (upcoming) {
    $('#stat-next').textContent = relativeTime(upcoming.preferred_at);
    $('#next-link').href = `/user/requests.html?id=${upcoming.request_id}`;
    $('#next-link').title = formatDateTime(upcoming.preferred_at);
  } else {
    $('#stat-next').textContent = 'None';
  }
}

async function loadUnread() {
  const r = await api('/notifications?unread_only=true&limit=1');
  if (r.ok) $('#stat-unread').textContent = r.body.data.unread_count;
}

// ---------- Latest requests ----------

async function loadLatest() {
  const box = clear($('#latest'));
  box.append(loadingNode());
  const r = await api('/pickup-requests/mine?limit=5');
  clear(box);
  if (!r.ok) return box.append(emptyNode(r.body.message));

  const requests = r.body.data.requests;
  if (requests.length === 0) return box.append(emptyNode('No requests yet. Your first pickup is one tap away.'));
  const list = el('ul', { className: 'db-list' });
  for (const req of requests) {
    list.append(el('li', {}, [
      el('a', { attrs: { href: `/user/requests.html?id=${req.request_id}` } }, [
        el('span', { className: 'db-list-icon' }, [icon(req.status === 'Completed' ? 'check' : req.status === 'Cancelled' ? 'alert' : 'truck')]),
        el('span', { className: 'db-list-main' }, [
          el('strong', { text: `#${req.request_id} · ${req.category_name}` }),
          el('small', { text: `${formatDateTime(req.preferred_at)} · ${req.actual_weight_kg ? `${req.actual_weight_kg} kg weighed` : `${req.estimated_weight_kg} kg estimated`}` })
        ]),
        statusBadge(req.status)
      ])
    ]));
  }
  box.append(list);
}

// Keep the unread card in step with the header badge (it polls every 30 s)
onUnreadCount((n) => { $('#stat-unread').textContent = n; });

await Promise.all([loadBalance(), loadRequests(), loadUnread(), loadLatest()]);
