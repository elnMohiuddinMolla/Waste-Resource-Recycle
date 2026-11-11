// Admin users (prompt.md C12, FR-20, api-spec.md §8.9): filter accounts, activate or
// deactivate them. An admin cannot deactivate themselves, and a collector with open jobs
// cannot be deactivated until those jobs are finished or rejected (MF-02).
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { el, $, clear, getParam, statusBadge, confirmDialog, toast, setLoading } from '../ui.js';

const me = await requireRole('admin');
renderHeader(me);

const PAGE_SIZE = 20;
const filters = $('#filters');
const tbody = $('#rows');
const state = {
  role: getParam('role') || '',
  status: getParam('status') || '',
  zone_id: getParam('zone_id') || '',
  page: 1
};
const ROLE_LABEL = { user: 'General user', collector: 'Collector', admin: 'Admin' };

function messageRow(text) {
  clear(tbody).append(el('tr', {}, [el('td', { text, className: 'empty', attrs: { colspan: 7 } })]));
}

async function setStatus(u, button) {
  const deactivate = u.status === 'active';
  // The server refuses this too (409): nobody else could finish the collector's open jobs
  if (deactivate && u.role === 'collector' && u.open_jobs > 0) {
    const jobs = `${u.open_jobs} open job${u.open_jobs === 1 ? '' : 's'}`;
    return toast(`${u.full_name} still has ${jobs}. Ask them to complete or reject ${u.open_jobs === 1 ? 'it' : 'them'} first.`, 'error', 7000);
  }
  const message = deactivate
    ? `Deactivate ${u.full_name}? They are logged out on their next action and cannot log in.`
    : `Reactivate ${u.full_name}? They can log in again.`;
  const ok = await confirmDialog(message, {
    title: deactivate ? 'Deactivate account' : 'Reactivate account',
    confirmText: deactivate ? 'Deactivate' : 'Reactivate',
    danger: deactivate
  });
  if (!ok) return;

  setLoading(button, true, 'Saving…');
  const r = await api(`/admin/users/${u.user_id}/status`, { method: 'PATCH', body: { status: deactivate ? 'inactive' : 'active' } });
  setLoading(button, false);
  if (!r.ok) return toast(r.body.message, 'error', 6000);
  toast(`${u.full_name} is now ${r.body.data.status}.`, 'success');
  load();
}

function renderRow(u) {
  const self = u.user_id === me.user_id;
  let action = el('span', { text: 'You', className: 'muted small' }); // no self-deactivation
  if (!self) {
    action = el('button', {
      text: u.status === 'active' ? 'Deactivate' : 'Activate',
      className: `btn btn-small ${u.status === 'active' ? 'btn-secondary' : 'btn-primary'}`,
      attrs: { type: 'button' }
    });
    action.addEventListener('click', () => setStatus(u, action));
  }
  return el('tr', { className: u.status === 'inactive' ? 'is-inactive' : '' }, [
    el('td', {}, [el('div', { text: u.full_name }), el('div', { text: `Joined ${String(u.created_at).slice(0, 10)}`, className: 'muted small' })]),
    el('td', {}, [el('div', { text: u.email }), el('a', { text: u.phone, className: 'small', attrs: { href: `tel:${u.phone}` } })]),
    el('td', { text: ROLE_LABEL[u.role] || u.role }),
    el('td', { text: u.zone_name || '—' }),
    el('td', { text: u.role === 'collector' ? String(u.open_jobs) : '—', className: 'num' }),
    el('td', {}, [statusBadge(u.status)]),
    el('td', {}, [action])
  ]);
}

async function load() {
  history.replaceState(null, '', location.pathname + query({ role: state.role, status: state.status, zone_id: state.zone_id }));
  messageRow('Loading…');
  const r = await api(`/admin/users${query({ ...state, limit: PAGE_SIZE })}`);
  if (!r.ok) return messageRow(r.body.message);

  const { total, users } = r.body.data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('#count').textContent = `${total} account${total === 1 ? '' : 's'}`;
  $('#pager').classList.toggle('hidden', pages <= 1);
  $('#page-info').textContent = `Page ${state.page} of ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;

  if (users.length === 0) return messageRow('No accounts match these filters.');
  clear(tbody);
  users.forEach((u) => tbody.append(renderRow(u)));
}

async function loadZones() {
  const r = await api('/admin/zones');
  if (!r.ok) return;
  for (const z of r.body.data) filters.zone_id.append(el('option', { text: z.name, attrs: { value: z.zone_id } }));
}

filters.addEventListener('submit', (e) => {
  e.preventDefault();
  Object.assign(state, { role: filters.role.value, status: filters.status.value, zone_id: filters.zone_id.value, page: 1 });
  load();
});
$('#reset').addEventListener('click', () => {
  filters.reset();
  Object.assign(state, { role: '', status: '', zone_id: '', page: 1 });
  load();
});
$('#prev').addEventListener('click', () => { state.page -= 1; load(); });
$('#next').addEventListener('click', () => { state.page += 1; load(); });

await loadZones();
filters.role.value = state.role;
filters.status.value = state.status;
filters.zone_id.value = state.zone_id;
await load();
