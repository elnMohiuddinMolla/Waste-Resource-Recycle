// Admin support tickets (PRD v1.5.0, FR-22, api-spec.md §9.4, §9.5).
// Open → Reply (the person is notified) → they or the admin close it. A reply can be
// changed while the ticket is not closed.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, getParam, formatDateTime, statusBadge, confirmDialog, formDialog, toast, setLoading, loadingNode, emptyNode
} from '../ui.js';

const user = await requireRole('admin');
renderHeader(user);

const PAGE_SIZE = 20;
const listBox = $('#list');
const state = { status: getParam('status') ?? 'Open', page: 1 };
if (state.status === 'all') state.status = '';

const HELP = {
  Open: 'New questions waiting for an answer. Reply, and the person gets a notification.',
  Answered: 'You have answered. The person closes the ticket when the problem is solved, or you can close it.',
  Closed: 'Finished tickets.',
  '': 'Every ticket, newest first.'
};

function replyDialog(t) {
  return formDialog({
    title: `${t.admin_reply ? 'Change the answer to' : 'Answer'} ticket #${t.ticket_id}`,
    intro: `${t.user_name} asked: "${t.subject}"`,
    confirmText: 'Send answer',
    fields: [{ name: 'reply', label: 'Your answer', type: 'textarea', value: t.admin_reply || '', attrs: { maxlength: 2000 }, hint: 'Clear and polite; 2 to 2000 characters.' }],
    onSubmit: (v) => api(`/admin/support-tickets/${t.ticket_id}/reply`, { method: 'PUT', body: { reply: v.reply } })
  });
}

async function reply(t) {
  const r = await replyDialog(t);
  if (!r) return;
  toast(`Answer sent to ${t.user_name}.`, 'success');
  load();
}

async function closeTicket(t, btn) {
  const ok = await confirmDialog(`Close ticket #${t.ticket_id} from ${t.user_name}?`, { title: 'Close ticket', confirmText: 'Close ticket' });
  if (!ok) return;
  setLoading(btn, true, 'Closing…');
  const r = await api(`/support-tickets/${t.ticket_id}/close`, { method: 'PATCH' });
  setLoading(btn, false);
  if (!r.ok) return toast(r.body.message, 'error', 6000);
  toast(`Ticket #${t.ticket_id} closed.`, 'success');
  load();
}

function ticketCard(t) {
  const related = [];
  if (t.request_id) related.push(el('a', { text: `Pickup #${t.request_id}`, attrs: { href: `/admin/requests.html?status=all&id=${t.request_id}` } }));
  if (t.redemption_id) related.push(el('a', { text: `Redemption #${t.redemption_id}`, attrs: { href: '/admin/redemptions.html?status=all' } }));

  const actions = [];
  if (t.status !== 'Closed') {
    actions.push(el('button', { text: t.admin_reply ? 'Change answer' : 'Reply', className: 'btn btn-primary btn-small', attrs: { type: 'button' }, on: { click: () => reply(t) } }));
    actions.push(el('button', { text: 'Close', className: 'btn btn-secondary btn-small', attrs: { type: 'button' }, on: { click: (e) => closeTicket(t, e.currentTarget) } }));
  }

  return el('article', { className: 'ticket' }, [
    el('div', { className: 'ticket-head' }, [
      el('div', {}, [
        el('strong', { text: `#${t.ticket_id} · ${t.subject}` }),
        el('small', { text: `${t.category} · ${formatDateTime(t.created_at)}` })
      ]),
      statusBadge(t.status)
    ]),
    el('p', { className: 'ticket-who small' }, [
      `${t.user_name} (${t.user_role}) · `,
      el('a', { text: t.user_phone, attrs: { href: `tel:${t.user_phone}` } }),
      ' · ',
      el('a', { text: t.user_email, attrs: { href: `mailto:${t.user_email}` } })
    ]),
    el('p', { className: 'ticket-message', text: t.message }),
    related.length ? el('p', { className: 'small mb-0' }, ['About: ', ...related.flatMap((a, i) => (i ? [', ', a] : [a]))]) : null,
    t.admin_reply
      ? el('div', { className: 'ticket-reply' }, [
        el('small', { text: `Answered by ${t.admin_name || 'admin'} · ${formatDateTime(t.replied_at)}` }),
        el('p', { className: 'mb-0', text: t.admin_reply })
      ])
      : null,
    actions.length ? el('div', { className: 'ticket-actions' }, actions) : null
  ]);
}

async function load() {
  document.querySelectorAll('.tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.status === state.status)));
  $('#help').textContent = HELP[state.status];
  history.replaceState(null, '', location.pathname + query({ status: state.status || 'all' }));

  clear(listBox).append(loadingNode());
  const r = await api(`/admin/support-tickets${query({ status: state.status, page: state.page, limit: PAGE_SIZE })}`);
  clear(listBox);
  if (!r.ok) return listBox.append(emptyNode(r.body.message));

  const { tickets, total } = r.body.data;
  $('#count').textContent = `${total} ticket${total === 1 ? '' : 's'}`;
  if (!tickets.length) listBox.append(emptyNode(state.status === 'Open' ? 'No open tickets — all caught up.' : 'No tickets here.'));
  listBox.append(...tickets.map(ticketCard));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('#pager').classList.toggle('hidden', pages <= 1);
  $('#page-info').textContent = `Page ${state.page} of ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  state.status = tab.dataset.status;
  state.page = 1;
  load();
}));
$('#prev').addEventListener('click', () => { state.page -= 1; load(); });
$('#next').addEventListener('click', () => { state.page += 1; load(); });
$('#refresh').addEventListener('click', load);

await load();
