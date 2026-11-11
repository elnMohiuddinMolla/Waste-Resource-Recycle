// User dashboard (prompt.md C3, PRD §4.1 step 2): balance, request counts,
// unread notifications and the latest requests.
import { api, query } from '../api.js';
import { startDashboard } from './dashboard-shell.js';
import { onUnreadCount } from '../notifications.js';
import { el, $, clear, formatPoints, formatTaka, formatDateTime, statusBadge, loadingNode, emptyNode } from '../ui.js';

const ACTIVE = ['Pending', 'Assigned', 'Accepted', 'Collected'];

await startDashboard('user', [
  ['My requests', 'Track each request and its timeline.', '/user/requests.html'],
  ['Points', 'See every point you earned and spent.', '/user/history.html'],
  ['Redeem', 'Turn your points into cash.', '/user/redeem.html'],
  ['Notifications', 'Updates about your pickups and payouts.', '/user/notifications.html']
]);

// Total number of my requests with a given status (one tiny page is enough)
async function countByStatus(status) {
  const r = await api(`/pickup-requests/mine${query({ status, limit: 1 })}`);
  return r.ok ? r.body.data.total : 0;
}

async function loadBalance() {
  const r = await api('/rewards/balance');
  if (!r.ok) return;
  $('#stat-balance').textContent = formatPoints(r.body.data.available_balance);
  const bdt = r.body.data.currency_equivalent_bdt;
  $('#stat-bdt').textContent = bdt === null ? '' : `≈ ${formatTaka(bdt)} at today's rate`;
}

async function loadCounts() {
  const [completed, ...active] = await Promise.all([countByStatus('Completed'), ...ACTIVE.map(countByStatus)]);
  $('#stat-completed').textContent = completed;
  $('#stat-active').textContent = active.reduce((a, b) => a + b, 0);
}

async function loadUnread() {
  const r = await api('/notifications?unread_only=true&limit=1');
  if (r.ok) $('#stat-unread').textContent = r.body.data.unread_count;
}

async function loadLatest() {
  const box = clear($('#latest'));
  box.append(loadingNode());
  const r = await api('/pickup-requests/mine?limit=5');
  clear(box);
  if (!r.ok) return box.append(emptyNode(r.body.message));

  const requests = r.body.data.requests;
  if (requests.length === 0) {
    return box.append(emptyNode('No requests yet. Your first pickup is one tap away.'));
  }
  const list = el('ul', { className: 'list' });
  for (const req of requests) {
    list.append(el('li', {}, [
      el('a', { className: 'list-item', attrs: { href: `/user/requests.html?id=${req.request_id}` } }, [
        el('div', { className: 'main' }, [
          el('div', { className: 'title', text: `#${req.request_id} · ${req.category_name}` }),
          el('div', { className: 'meta', text: `Pickup ${formatDateTime(req.preferred_at)} · ${req.estimated_weight_kg} kg estimated` })
        ]),
        statusBadge(req.status)
      ])
    ]));
  }
  box.append(list);
}

// Keep the unread card in step with the header badge (it polls every 30 s)
onUnreadCount((n) => { $('#stat-unread').textContent = n; });

await Promise.all([loadBalance(), loadCounts(), loadUnread(), loadLatest()]);
