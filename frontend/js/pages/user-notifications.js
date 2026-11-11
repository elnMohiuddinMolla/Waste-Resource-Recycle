// Notifications page (prompt.md C3, FR-14, api-spec.md Module 7)
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { notificationsChanged } from '../notifications.js';
import { el, $, clear, formatDateTime, toast, setLoading, loadingNode, emptyNode } from '../ui.js';

const user = await requireRole('user');
renderHeader(user);

let filter = 'all';
const listBox = $('#list');
const markAllBtn = $('#mark-all');

// Where a notification leads: its pickup request or the redemption page
function linkFor(n) {
  if (n.request_id) return { href: `/user/requests.html?id=${n.request_id}`, text: `View request #${n.request_id}` };
  if (n.redemption_id) return { href: '/user/redeem.html', text: 'View redemptions' };
  return null;
}

async function markRead(n, item, button) {
  setLoading(button, true, 'Saving…');
  const r = await api(`/notifications/${n.notification_id}/read`, { method: 'PATCH' });
  if (!r.ok) {
    setLoading(button, false);
    return toast(r.body.message, 'error');
  }
  notificationsChanged();
  if (filter === 'unread') return load(); // it no longer belongs in this view
  item.classList.remove('unread');
  button.remove();
  updateSummary(Number(markAllBtn.dataset.unread) - 1);
}

function updateSummary(unread) {
  markAllBtn.dataset.unread = String(unread);
  markAllBtn.disabled = unread === 0;
  $('#summary').textContent = unread === 0 ? 'You are all caught up.' : `${unread} unread`;
}

function renderItem(n) {
  const item = el('li', { className: `list-item notif${n.is_read ? '' : ' unread'}` });
  const link = linkFor(n);
  const actions = el('div', { className: 'row' });
  if (link) actions.append(el('a', { text: link.text, className: 'btn btn-secondary btn-small', attrs: { href: link.href } }));
  if (!n.is_read) {
    const btn = el('button', { text: 'Mark as read', className: 'btn btn-secondary btn-small', attrs: { type: 'button' } });
    btn.addEventListener('click', () => markRead(n, item, btn));
    actions.append(btn);
  }
  item.append(
    el('div', { className: 'main' }, [
      el('div', { className: 'title', text: n.message }),
      el('div', { className: 'meta', text: formatDateTime(n.created_at) })
    ]),
    actions
  );
  return item;
}

async function load() {
  clear(listBox).append(loadingNode());
  const r = await api(`/notifications?limit=50${filter === 'unread' ? '&unread_only=true' : ''}`);
  clear(listBox);
  if (!r.ok) return listBox.append(emptyNode(r.body.message));

  const { unread_count: unread, notifications } = r.body.data;
  updateSummary(unread);
  if (notifications.length === 0) {
    return listBox.append(emptyNode(filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'));
  }
  const list = el('ul', { className: 'list' });
  notifications.forEach((n) => list.append(renderItem(n)));
  listBox.append(list);
  if (notifications.length === 50) {
    listBox.append(el('p', { text: 'Showing the 50 most recent.', className: 'muted small center mt-1 mb-0' }));
  }
}

markAllBtn.addEventListener('click', async () => {
  setLoading(markAllBtn, true, 'Saving…');
  const r = await api('/notifications/read-all', { method: 'PATCH' });
  setLoading(markAllBtn, false);
  if (!r.ok) return toast(r.body.message, 'error');
  toast(`${r.body.data.updated} marked as read.`, 'success');
  notificationsChanged();
  load();
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    filter = tab.dataset.filter;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    load();
  });
});

await load();
