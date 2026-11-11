// Support tickets for users and collectors (PRD v1.5.0, FR-22, api-spec.md Module 9).
// Open a ticket (optionally about one of my pickups or cash-outs), read the admin's
// answer, close it. ?request_id= or ?redemption_id= pre-selects the related item.
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { notificationsChanged } from '../notifications.js';
import {
  el, $, clear, getParam, formatDateTime, statusBadge, confirmDialog, clearErrors, showFieldErrors,
  showApiError, setLoading, toast, loadingNode, emptyNode
} from '../ui.js';

const user = await requireRole('user', 'collector');
renderHeader(user);

const form = $('#ticket-form');
const button = form.querySelector('button[type="submit"]');
const listBox = $('#tickets');
const CATEGORY_TEXT = { Pickup: 'A pickup', Points: 'Points', Redemption: 'Cash-out', Account: 'Account', Other: 'Other' };

// ---------- The related pickup / cash-out choices ----------

async function loadChoices() {
  // Users: their own requests; collectors: the jobs assigned to them
  const r = user.role === 'user'
    ? await api('/pickup-requests/mine?limit=50')
    : await api('/collector/requests?status=Assigned,Accepted,Collected');
  const requests = r.ok ? (user.role === 'user' ? r.body.data.requests : r.body.data) : [];
  for (const q of requests) {
    form.request_id.append(el('option', { text: `#${q.request_id} · ${q.category_name} · ${q.status}`, attrs: { value: q.request_id } }));
  }

  if (user.role === 'user') {
    const red = await api('/redemptions/mine');
    if (red.ok) {
      for (const x of red.body.data) {
        form.redemption_id.append(el('option', { text: `#${x.redemption_id} · ${x.points_redeemed} points · ${x.status}`, attrs: { value: x.redemption_id } }));
      }
    }
  }

  const requestParam = getParam('request_id');
  const redemptionParam = getParam('redemption_id');
  if (requestParam) { form.category.value = 'Pickup'; form.request_id.value = requestParam; }
  if (redemptionParam && user.role === 'user') { form.category.value = 'Redemption'; form.redemption_id.value = redemptionParam; }
  showRelatedFields();
}

// Only users have cash-outs; show that choice when the topic is points or a cash-out
function showRelatedFields() {
  const money = ['Redemption', 'Points'].includes(form.category.value);
  $('#redemption-field').classList.toggle('hidden', user.role !== 'user' || !money);
  if ($('#redemption-field').classList.contains('hidden')) form.redemption_id.value = '';
}

// ---------- My tickets ----------

function ticketCard(t) {
  const related = [];
  if (t.request_id) {
    const href = user.role === 'user' ? `/user/requests.html?id=${t.request_id}` : `/collector/requests.html#job-${t.request_id}`;
    related.push(el('a', { text: `Pickup #${t.request_id}`, attrs: { href } }));
  }
  if (t.redemption_id) related.push(el('a', { text: `Cash-out #${t.redemption_id}`, attrs: { href: '/user/redeem.html' } }));

  const closeBtn = t.status !== 'Closed'
    ? el('button', { text: 'Close ticket', className: 'btn btn-secondary btn-small', attrs: { type: 'button' }, on: { click: (e) => closeTicket(t, e.currentTarget) } })
    : null;

  return el('article', { className: 'ticket', attrs: { id: `ticket-${t.ticket_id}` } }, [
    el('div', { className: 'ticket-head' }, [
      el('div', {}, [
        el('strong', { text: `#${t.ticket_id} · ${t.subject}` }),
        el('small', { text: `${CATEGORY_TEXT[t.category] || t.category} · ${formatDateTime(t.created_at)}` })
      ]),
      statusBadge(t.status)
    ]),
    el('p', { className: 'ticket-message', text: t.message }),
    related.length ? el('p', { className: 'small mb-0' }, ['About: ', ...related.flatMap((a, i) => (i ? [', ', a] : [a]))]) : null,
    t.admin_reply
      ? el('div', { className: 'ticket-reply' }, [
        el('small', { text: `Admin's answer · ${formatDateTime(t.replied_at)}` }),
        el('p', { className: 'mb-0', text: t.admin_reply })
      ])
      : (t.status === 'Open' ? el('p', { className: 'muted small mb-0', text: 'Waiting for an answer.' }) : null),
    closeBtn ? el('div', { className: 'ticket-actions' }, [closeBtn]) : null
  ]);
}

async function loadTickets() {
  clear(listBox).append(loadingNode());
  const r = await api('/support-tickets/mine?limit=50');
  clear(listBox);
  if (!r.ok) return listBox.append(emptyNode(r.body.message));
  const { tickets, total } = r.body.data;
  const open = tickets.filter((t) => t.status !== 'Closed').length;
  $('#count').textContent = total ? `${open} open · ${total} in total` : '';
  if (!tickets.length) return listBox.append(emptyNode('No tickets yet. Most questions are answered in the FAQ.'));
  listBox.append(...tickets.map(ticketCard));
  const focus = getParam('ticket');
  if (focus && $(`#ticket-${CSS.escape(focus)}`)) $(`#ticket-${CSS.escape(focus)}`).scrollIntoView({ block: 'center' });
}

async function closeTicket(t, btn) {
  const ok = await confirmDialog(`Close ticket #${t.ticket_id}? Close it when your problem is solved.`, { title: 'Close ticket', confirmText: 'Close ticket' });
  if (!ok) return;
  setLoading(btn, true, 'Closing…');
  const r = await api(`/support-tickets/${t.ticket_id}/close`, { method: 'PATCH' });
  setLoading(btn, false);
  if (!r.ok) return toast(r.body.message, 'error', 6000);
  toast(`Ticket #${t.ticket_id} closed.`, 'success');
  loadTickets();
}

// ---------- New ticket ----------

form.category.addEventListener('change', showRelatedFields);
form.message.addEventListener('input', () => { $('#message-count').textContent = form.message.value.length; });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);
  const body = {
    category: form.category.value,
    subject: form.subject.value.trim(),
    message: form.message.value.trim(),
    request_id: form.request_id.value || undefined,
    redemption_id: form.redemption_id.value || undefined
  };
  const errors = [];
  if (body.subject.length < 5) errors.push({ field: 'subject', message: 'Write a short subject (at least 5 characters).' });
  if (body.message.length < 10) errors.push({ field: 'message', message: 'Describe the problem (at least 10 characters).' });
  if (errors.length) return showFieldErrors(form, errors);

  setLoading(button, true, 'Sending…');
  const r = await api('/support-tickets', { method: 'POST', body });
  setLoading(button, false);
  if (!r.ok) return showApiError(form, r);

  toast('Ticket sent. You will get a notification when the admin answers.', 'success', 6000);
  form.subject.value = '';
  form.message.value = '';
  $('#message-count').textContent = '0';
  notificationsChanged();
  loadTickets();
});

await Promise.all([loadChoices(), loadTickets()]);
