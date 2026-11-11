// Collector dashboard (prompt.md C7, PRD §4.2): job counts by status, today's
// completed collections and the latest notifications.
import { api, query } from '../api.js';
import { startDashboard } from './dashboard-shell.js';
import { notificationsChanged } from '../notifications.js';
import { el, $, clear, formatDateTime, toast, setLoading, loadingNode, emptyNode } from '../ui.js';

await startDashboard('collector', [
  ['My jobs', 'Accept, reject or work on your assigned pickups.', '/collector/requests.html'],
  ['History', 'Your completed collections and total kg.', '/collector/records.html']
]);

function bdToday() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function loadCounts() {
  const r = await api('/collector/requests?status=Assigned,Accepted,Collected');
  if (!r.ok) return;
  const count = (s) => r.body.data.filter((j) => j.status === s).length;
  $('#stat-assigned').textContent = count('Assigned');
  $('#stat-accepted').textContent = count('Accepted');
  $('#stat-collected').textContent = count('Collected');
}

async function loadToday() {
  const today = bdToday();
  const r = await api(`/collector/history${query({ from: today, to: today, limit: 1 })}`);
  if (!r.ok) return;
  $('#stat-today').textContent = r.body.data.summary.total_completed_pickups;
  $('#stat-today-kg').textContent = `${r.body.data.summary.total_kg_collected} kg`;
}

async function loadNotifications() {
  const box = clear($('#notifications'));
  box.append(loadingNode());
  const r = await api('/notifications?limit=5');
  clear(box);
  if (!r.ok) return box.append(emptyNode(r.body.message));

  const { unread_count: unread, notifications } = r.body.data;
  $('#mark-all').disabled = unread === 0;
  if (notifications.length === 0) return box.append(emptyNode('No notifications yet.'));

  const list = el('ul', { className: 'list' });
  for (const n of notifications) {
    list.append(el('li', { className: `list-item notif${n.is_read ? '' : ' unread'}` }, [
      el('div', { className: 'main' }, [
        el('div', { className: 'title', text: n.message }),
        el('div', { className: 'meta', text: formatDateTime(n.created_at) })
      ]),
      n.request_id ? el('a', { text: 'Open job', className: 'btn btn-secondary btn-small', attrs: { href: `/collector/requests.html?status=Assigned,Accepted,Collected#job-${n.request_id}` } }) : null
    ]));
  }
  box.append(list);
}

$('#mark-all').addEventListener('click', async (event) => {
  const btn = event.currentTarget;
  setLoading(btn, true, 'Saving…');
  const r = await api('/notifications/read-all', { method: 'PATCH' });
  setLoading(btn, false);
  if (!r.ok) return toast(r.body.message, 'error');
  notificationsChanged();
  loadNotifications();
});

await Promise.all([loadCounts(), loadToday(), loadNotifications()]);
