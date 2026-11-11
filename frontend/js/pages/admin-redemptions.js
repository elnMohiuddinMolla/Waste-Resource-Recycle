// Admin redemptions (prompt.md C11, FR-21, api-spec.md §8.3, §8.4).
// Pending → Approve / Reject; Approved → Mark paid (TrxID) / Reject. Paid and Rejected are final.
// Rejecting gives the held points back to the user (REFUND).
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, getParam, formatDateTime, formatPoints, formatTaka, statusBadge, confirmDialog, reasonDialog,
  toast, setLoading, loadingNode, emptyNode
} from '../ui.js';

const user = await requireRole('admin');
renderHeader(user);

const PAGE_SIZE = 20;
const TRX = /^[A-Za-z0-9-]{4,50}$/;
const listBox = $('#list');
const state = { status: getParam('status') ?? 'Pending', page: 1 };
if (state.status === 'all') state.status = '';

const HELP = {
  Pending: 'Check the account details, then approve or reject. Rejecting refunds the points.',
  Approved: 'Send the money through the payout channel, then mark it paid with the transaction ID.',
  Paid: 'Completed payouts with their transaction IDs.',
  Rejected: 'Rejected requests. The points were refunded to the user.',
  '': 'Every redemption, oldest first.'
};

// ---------- Mark paid: ask for the bKash / Nagad / bank transaction ID ----------

function payDialog(x) {
  return new Promise((resolve) => {
    const close = (answer) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(answer); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const trx = el('input', { attrs: { id: 'trx', maxlength: 50, autocomplete: 'off', placeholder: 'e.g. BK99X8877A', required: true } });
    const note = el('input', { attrs: { id: 'pay-note', maxlength: 200, placeholder: 'optional' } });
    const error = el('div', { className: 'field-error' });

    const form = el('form', { className: 'form', attrs: { novalidate: true } }, [
      el('p', { className: 'mb-0', text: `Send ${formatTaka(x.cash_amount)} to ${x.payout_method} ${x.payout_account} (${x.user_name}), then enter the transaction ID.` }),
      el('div', { className: 'field' }, [el('label', { text: 'Transaction ID', attrs: { for: 'trx' } }), trx, error]),
      el('div', { className: 'field' }, [el('label', { text: 'Note', attrs: { for: 'pay-note' } }), note]),
      el('div', { className: 'modal-actions' }, [
        el('button', { text: 'Cancel', className: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el('button', { text: 'Mark as paid', className: 'btn btn-primary', attrs: { type: 'submit' } })
      ])
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = trx.value.trim();
      if (!TRX.test(value)) {
        error.textContent = 'Enter 4 to 50 letters, digits or dashes.';
        trx.classList.add('invalid');
        trx.focus();
        return;
      }
      close({ payout_trx_id: value, admin_note: note.value.trim() || undefined });
    });

    const backdrop = el('div', { className: 'modal-backdrop', on: { click: (e) => { if (e.target === backdrop) close(null); } } }, [
      el('div', { className: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [el('h2', { text: `Pay redemption #${x.redemption_id}` }), form])
    ]);
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    trx.focus();
  });
}

// ---------- Actions ----------

async function decide(x, button, body, successText) {
  setLoading(button, true, 'Saving…');
  const r = await api(`/admin/redemptions/${x.redemption_id}`, { method: 'PATCH', body });
  setLoading(button, false);
  if (!r.ok) toast(r.body.message, 'error', 6000); // e.g. 409 if another admin already acted
  else toast(successText, 'success', 6000);
  await load();
}

async function approve(x, button) {
  const ok = await confirmDialog(`Approve ${formatTaka(x.cash_amount)} for ${x.user_name} to ${x.payout_method} ${x.payout_account}?`, {
    title: `Approve redemption #${x.redemption_id}`, confirmText: 'Approve'
  });
  if (ok) decide(x, button, { action: 'approve' }, `Redemption #${x.redemption_id} approved. Send the money, then mark it paid.`);
}

async function pay(x, button) {
  const answer = await payDialog(x);
  if (answer) decide(x, button, { action: 'paid', ...answer }, `Redemption #${x.redemption_id} marked as paid.`);
}

async function reject(x, button) {
  const note = await reasonDialog({
    title: `Reject redemption #${x.redemption_id}`,
    message: `${formatPoints(x.points_redeemed)} points will be refunded to ${x.user_name}. The reason is shown to them.`,
    placeholder: 'e.g. Invalid bKash wallet number',
    confirmText: 'Reject and refund',
    danger: true
  });
  if (note) decide(x, button, { action: 'reject', admin_note: note }, `Redemption #${x.redemption_id} rejected; points refunded.`);
}

function actions(x) {
  const btn = (text, cls, handler) => {
    const b = el('button', { text, className: `btn ${cls} btn-small`, attrs: { type: 'button' } });
    b.addEventListener('click', () => handler(x, b));
    return b;
  };
  if (x.status === 'Pending') return [btn('Approve', 'btn-primary', approve), btn('Reject', 'btn-secondary', reject)];
  if (x.status === 'Approved') return [btn('Mark paid', 'btn-primary', pay), btn('Reject', 'btn-secondary', reject)];
  return [];
}

// ---------- List ----------

function renderItem(x) {
  const meta = [
    `${x.payout_method} · ${x.payout_account}`,
    `Requested ${formatDateTime(x.requested_at)}${x.processed_at ? ` · Updated ${formatDateTime(x.processed_at)}` : ''}`
  ];
  return el('li', { className: 'list-item' }, [
    el('div', { className: 'main' }, [
      el('div', { className: 'title', text: `#${x.redemption_id} · ${formatTaka(x.cash_amount)} · ${formatPoints(x.points_redeemed)} points` }),
      el('div', { className: 'meta' }, [`${x.user_name} · `, el('a', { text: x.user_phone, attrs: { href: `tel:${x.user_phone}` } })]),
      ...meta.map((m) => el('div', { className: 'meta', text: m })),
      x.payout_trx_id ? el('div', { className: 'meta', text: `Transaction ID: ${x.payout_trx_id}` }) : null,
      x.admin_note ? el('div', { className: 'meta', text: `Note: ${x.admin_note}` }) : null
    ]),
    el('div', { className: 'row' }, [statusBadge(x.status), ...actions(x)])
  ]);
}

async function load() {
  history.replaceState(null, '', location.pathname + query({ status: state.status || 'all' }));
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.status === state.status)));
  $('#help').textContent = HELP[state.status] || '';

  clear(listBox).append(loadingNode());
  const r = await api(`/admin/redemptions${query({ status: state.status, page: state.page, limit: PAGE_SIZE })}`);
  clear(listBox);
  if (!r.ok) return listBox.append(emptyNode(r.body.message));

  const { total, redemptions } = r.body.data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('#count').textContent = `${total} redemption${total === 1 ? '' : 's'} · oldest first`;
  if (redemptions.length === 0) listBox.append(emptyNode('Nothing here.'));
  else {
    const list = el('ul', { className: 'list' });
    redemptions.forEach((x) => list.append(renderItem(x)));
    listBox.append(list);
  }
  $('#pager').classList.toggle('hidden', pages <= 1);
  $('#page-info').textContent = `Page ${state.page} of ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => { state.status = tab.dataset.status; state.page = 1; load(); });
});
$('#refresh').addEventListener('click', load);
$('#prev').addEventListener('click', () => { state.page -= 1; load(); });
$('#next').addEventListener('click', () => { state.page += 1; load(); });

await load();
