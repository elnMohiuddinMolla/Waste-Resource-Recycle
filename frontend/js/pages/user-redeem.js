// Redeem points (prompt.md C6, FR-15, api-spec.md Module 6).
// The server re-checks everything under a row lock; these checks only guide the user.
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, formatPoints, formatTaka, formatDateTime, statusBadge, confirmDialog, toast,
  setLoading, clearErrors, showFieldErrors, showApiError, loadingNode, emptyNode
} from '../ui.js';

const user = await requireRole('user');
renderHeader(user);

const form = $('#redeem-form');
const submitBtn = form.querySelector('button[type="submit"]');
const PHONE = /^(?:\+8801|01)[3-9]\d{8}$/;
const BANK = /^[0-9-]{6,30}$/;

let balance = 0;
let rule = null; // { taka_per_point, min_points } or null when no rule is active

const ACCOUNT_TEXT = {
  bKash: ['bKash number', 'The 11-digit mobile number of your bKash account.', 'tel'],
  Nagad: ['Nagad number', 'The 11-digit mobile number of your Nagad account.', 'tel'],
  Bank: ['Bank account number', '6 to 30 digits (dashes allowed).', 'numeric']
};

function cash(points) {
  return rule ? Math.round(points * Number(rule.taka_per_point) * 100) / 100 : 0;
}

function updatePreview() {
  const points = Number(form.points_redeemed.value) || 0;
  $('#preview').textContent = formatTaka(cash(points));
}

function updateAccountField() {
  const [label, hint, mode] = ACCOUNT_TEXT[form.payout_method.value];
  $('#account-label').textContent = label;
  $('#account-hint').textContent = hint;
  form.payout_account.inputMode = mode;
  if (form.payout_method.value !== 'Bank' && !form.payout_account.value) form.payout_account.value = user.phone || '';
}

// Turn the form off (with a reason) when redeeming is not possible right now
function updateAvailability() {
  const blocked = $('#blocked');
  let reason = '';
  if (!rule) reason = 'Cash redemption is not available right now: no conversion rate is set.';
  else if (balance < Number(rule.min_points)) {
    reason = `You need at least ${formatPoints(rule.min_points)} points to redeem. You have ${formatPoints(balance)}.`;
  }
  blocked.textContent = reason;
  blocked.classList.toggle('hidden', !reason);
  form.querySelectorAll('input, select, button').forEach((n) => { n.disabled = Boolean(reason); });
}

async function loadBalanceAndRule() {
  const [b, r] = await Promise.all([api('/rewards/balance'), api('/redemptions/rules/active')]);
  if (b.ok) balance = Number(b.body.data.available_balance);
  rule = r.ok ? r.body.data : null;

  $('#balance').textContent = formatPoints(balance);
  if (rule) {
    $('#rate').textContent = `৳ ${Number(rule.taka_per_point)}`;
    $('#minimum').textContent = `per point · minimum ${formatPoints(rule.min_points)} points`;
    form.points_redeemed.min = rule.min_points;
  } else {
    $('#rate').textContent = '—';
    $('#minimum').textContent = 'No active rate';
  }
  form.points_redeemed.max = balance;
  updateAvailability();
  updatePreview();
}

function renderRedemption(x) {
  const lines = [
    `${formatPoints(x.points_redeemed)} points → ${formatTaka(x.cash_amount)}`,
    `${x.payout_method} · ${x.payout_account}`,
    `Requested ${formatDateTime(x.requested_at)}${x.processed_at ? ` · Updated ${formatDateTime(x.processed_at)}` : ''}`
  ];
  const extra = [];
  if (x.status === 'Paid' && x.payout_trx_id) extra.push(el('div', { className: 'meta', text: `Transaction ID: ${x.payout_trx_id}` }));
  if (x.status === 'Rejected') {
    extra.push(el('div', { className: 'meta', text: `Reason: ${x.admin_note || '—'} · Points were refunded.` }));
  }
  return el('li', { className: 'list-item' }, [
    el('div', { className: 'main' }, [
      el('div', { className: 'title', text: `#${x.redemption_id} · ${lines[0]}` }),
      el('div', { className: 'meta', text: lines[1] }),
      el('div', { className: 'meta', text: lines[2] }),
      ...extra
    ]),
    statusBadge(x.status)
  ]);
}

async function loadRedemptions() {
  const box = clear($('#redemptions'));
  box.append(loadingNode());
  const r = await api('/redemptions/mine');
  clear(box);
  if (!r.ok) return box.append(emptyNode(r.body.message));
  if (r.body.data.length === 0) return box.append(emptyNode('No redemptions yet.'));
  const list = el('ul', { className: 'list' });
  r.body.data.forEach((x) => list.append(renderRedemption(x)));
  box.append(list);
}

function localChecks(points, method, account) {
  const errors = [];
  if (!(points > 0)) errors.push({ field: 'points_redeemed', message: 'Enter how many points to redeem.' });
  else if (rule && points < Number(rule.min_points)) {
    errors.push({ field: 'points_redeemed', message: `You must redeem at least ${formatPoints(rule.min_points)} points.` });
  } else if (points > balance) {
    errors.push({ field: 'points_redeemed', message: `You only have ${formatPoints(balance)} points.` });
  }
  if (method === 'Bank' ? !BANK.test(account) : !PHONE.test(account)) {
    errors.push({ field: 'payout_account', message: ACCOUNT_TEXT[method][1] });
  }
  return errors;
}

form.points_redeemed.addEventListener('input', updatePreview);
form.payout_method.addEventListener('change', updateAccountField);
$('#use-all').addEventListener('click', () => {
  form.points_redeemed.value = balance.toFixed(2);
  updatePreview();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);
  const points = Math.round(Number(form.points_redeemed.value) * 100) / 100;
  const method = form.payout_method.value;
  const account = form.payout_account.value.trim();
  const errors = localChecks(points, method, account);
  if (errors.length) return showFieldErrors(form, errors);

  const ok = await confirmDialog(
    `Redeem ${formatPoints(points)} points for ${formatTaka(cash(points))}, paid to ${method} ${account}? The points are held until the admin pays or rejects.`,
    { title: 'Confirm redemption', confirmText: 'Yes, request cash' }
  );
  if (!ok) return;

  setLoading(submitBtn, true, 'Submitting…');
  const r = await api('/redemptions', { method: 'POST', body: { points_redeemed: points, payout_method: method, payout_account: account } });
  setLoading(submitBtn, false);

  if (r.ok) {
    toast(`Redemption #${r.body.data.redemption_id} submitted: ${formatTaka(r.body.data.cash_amount)}.`, 'success', 6000);
    form.points_redeemed.value = '';
    await Promise.all([loadBalanceAndRule(), loadRedemptions()]);
    return;
  }
  // 422 (balance / minimum / no rule) has no errors[]: put it under the points field
  if (r.status === 422) return showFieldErrors(form, [{ field: 'points_redeemed', message: r.body.message }]);
  showApiError(form, r);
});

updateAccountField();
await Promise.all([loadBalanceAndRule(), loadRedemptions()]);
