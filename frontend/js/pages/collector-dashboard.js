// Collector dashboard (prompt.md C7, PRD §4.2): jobs by stage, the next job with
// tap-to-call, today's completed collections and the latest notifications.
import { api, query } from '../api.js';
import { startDashboard, relativeTime } from './dashboard-shell.js';
import { notificationsChanged } from '../notifications.js';
import { icon } from '../icons.js';
import { el, $, clear, formatDateTime, statusBadge, toast, setLoading, loadingNode, emptyNode, requestPhoto } from '../ui.js';

await startDashboard('collector', [
  ['My jobs', 'Accept, reject or work on your pickups.', '/collector/requests.html', 'truck'],
  ['Collection history', 'Completed collections and total kg.', '/collector/records.html', 'history'],
  ['Notifications', 'New jobs and updates.', '/collector/dashboard.html#notifications', 'bell']
]);

function bdToday() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// What to do next with a job, and where
function nextAction(job) {
  if (job.status === 'Assigned') return ['Accept or reject', `/collector/requests.html?status=Assigned#job-${job.request_id}`];
  if (job.status === 'Accepted') return ['Record weight', `/collector/record-weight.html?id=${job.request_id}`];
  return ['Mark as completed', `/collector/requests.html?status=Collected#job-${job.request_id}`];
}

function detail(iconName, content) {
  return el('li', {}, [el('span', { className: 'db-detail-icon' }, [icon(iconName)]), content]);
}

function renderNextJob(jobs) {
  const box = clear($('#next-job'));
  if (jobs.length === 0) {
    box.append(el('div', { className: 'db-empty' }, [
      el('span', { className: 'db-empty-icon' }, [icon('check')]),
      el('p', { text: 'No open jobs. New jobs appear here when the admin assigns them.' })
    ]));
    return;
  }
  // Weighed jobs only need one click, so they come first; then the earliest pickup time
  const order = { Collected: 0, Accepted: 1, Assigned: 2 };
  const job = [...jobs].sort((a, b) => order[a.status] - order[b.status] || a.preferred_at.localeCompare(b.preferred_at))[0];
  const [label, href] = nextAction(job);
  const when = relativeTime(job.preferred_at);
  box.append(
    el('div', { className: 'db-track-head' }, [
      el('div', {}, [
        el('strong', { text: `#${job.request_id} · ${job.category_name}` }),
        el('small', { text: `${formatDateTime(job.preferred_at)} (${when})` })
      ]),
      statusBadge(job.status)
    ]),
    requestPhoto(job.request_id, job.has_photo),
    el('ul', { className: 'db-details' }, [
      detail('users', el('span', { text: job.user_name })),
      detail('phone', el('a', { text: job.contact_phone, className: 'phone-link', attrs: { href: `tel:${job.contact_phone}` } })),
      detail('pin', el('span', { text: `${job.pickup_address} · ${job.zone_name}` })),
      detail('scale', el('span', { text: `${job.estimated_weight_kg} kg estimated` }))
    ]),
    el('div', { className: 'db-card-actions' }, [
      el('a', { text: label, className: 'btn btn-primary', attrs: { href } }),
      jobs.length > 1 ? el('a', { text: `${jobs.length - 1} more open job${jobs.length === 2 ? '' : 's'}`, className: 'btn btn-secondary', attrs: { href: '/collector/requests.html' } }) : null
    ])
  );
}

async function loadJobs() {
  const r = await api('/collector/requests?status=Assigned,Accepted,Collected');
  if (!r.ok) return;
  const jobs = r.body.data;
  const count = (s) => jobs.filter((j) => j.status === s).length;
  $('#stat-assigned').textContent = count('Assigned');
  $('#stat-accepted').textContent = count('Accepted');
  $('#stat-collected').textContent = count('Collected');
  document.querySelectorAll('.db-stage').forEach((stage, i) => {
    stage.classList.toggle('has-work', count(['Assigned', 'Accepted', 'Collected'][i]) > 0);
  });
  $('#stat-open').textContent = jobs.length ? `${jobs.length} open job${jobs.length === 1 ? '' : 's'} waiting` : 'No open jobs right now';
  renderNextJob(jobs);
}

async function loadToday() {
  const today = bdToday();
  const r = await api(`/collector/history${query({ from: today, to: today, limit: 1 })}`);
  if (!r.ok) return;
  const s = r.body.data.summary;
  $('#stat-today-kg').textContent = Number(s.total_kg_collected).toFixed(2).replace(/\.00$/, '');
  $('#stat-today').textContent = `${s.total_completed_pickups} pickup${s.total_completed_pickups === 1 ? '' : 's'} completed`;
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

  const list = el('ul', { className: 'db-list' });
  for (const n of notifications) {
    const inner = [
      el('span', { className: `db-list-icon${n.is_read ? '' : ' unread'}` }, [icon('bell')]),
      el('span', { className: 'db-list-main' }, [
        el('strong', { text: n.message }),
        el('small', { text: formatDateTime(n.created_at) })
      ])
    ];
    list.append(el('li', { className: n.is_read ? '' : 'unread' }, [
      n.request_id
        ? el('a', { attrs: { href: `/collector/requests.html?status=Assigned,Accepted,Collected#job-${n.request_id}` } }, inner)
        : el('div', { className: 'db-list-row' }, inner)
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

await Promise.all([loadJobs(), loadToday(), loadNotifications()]);
