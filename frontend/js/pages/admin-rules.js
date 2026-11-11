// Admin redemption rules (prompt.md C12, FR-16, api-spec.md §8.8): see the active rule
// and its history, and activate a new one. Exactly one rule is active at a time.
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, formatDateTime, formatPoints, formatTaka, confirmDialog, toast, setLoading,
  clearErrors, showFieldErrors, showApiError, emptyNode
} from '../ui.js';

const me = await requireRole('admin');
renderHeader(me);

const form = $('#rule-form');
const submitBtn = form.querySelector('button[type="submit"]');
const RATE = /^\d{1,6}(\.\d{1,4})?$/;

function renderActive(rule) {
  const box = clear($('#active'));
  if (!rule) return box.append(emptyNode('No rule is active, so users cannot redeem. Set one.'));
  box.append(
    el('div', { className: 'stat-value', text: `৳ ${Number(rule.taka_per_point)} per point` }),
    el('p', { className: 'muted', text: `Minimum ${formatPoints(rule.min_points)} points · e.g. ${formatPoints(rule.min_points || 100)} points = ${formatTaka(Number(rule.min_points || 100) * Number(rule.taka_per_point))}` }),
    el('p', { className: 'muted small mb-0', text: `Set by ${rule.updated_by_name} on ${formatDateTime(rule.effective_from)}` })
  );
}

function renderHistory(active, archived) {
  const tbody = clear($('#history'));
  const rows = [active, ...archived].filter(Boolean);
  if (rows.length === 0) {
    return tbody.append(el('tr', {}, [el('td', { text: 'No rules yet.', className: 'empty', attrs: { colspan: 5 } })]));
  }
  for (const r of rows) {
    tbody.append(el('tr', { className: r.is_active ? '' : 'is-inactive' }, [
      el('td', {}, [`#${r.rule_id} `, r.is_active ? el('span', { text: 'active', className: 'tag' }) : null]),
      el('td', { text: r.taka_per_point, className: 'num' }),
      el('td', { text: r.min_points, className: 'num' }),
      el('td', { text: r.updated_by_name }),
      el('td', { text: formatDateTime(r.effective_from) })
    ]));
  }
}

async function load() {
  const r = await api('/admin/redemption-rules');
  if (!r.ok) return toast(r.body.message, 'error');
  renderActive(r.body.data.active);
  renderHistory(r.body.data.active, r.body.data.archived);
}

function updateExample() {
  const rate = Number(form.taka_per_point.value);
  const min = Number(form.min_points.value);
  $('#example').textContent = rate > 0
    ? `With this rule ${formatPoints(min || 100)} points = ${formatTaka((min || 100) * rate)}.`
    : 'Enter a rate to see an example.';
}

form.taka_per_point.addEventListener('input', updateExample);
form.min_points.addEventListener('input', updateExample);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(form);
  const rate = form.taka_per_point.value.trim();
  const min = form.min_points.value.trim();
  const errors = [];
  if (!RATE.test(rate) || Number(rate) <= 0) errors.push({ field: 'taka_per_point', message: 'More than 0, with at most 4 decimals.' });
  if (min === '' || Number(min) < 0) errors.push({ field: 'min_points', message: 'Enter 0 or more.' });
  if (errors.length) return showFieldErrors(form, errors);

  const ok = await confirmDialog(`Activate ৳ ${Number(rate)} per point with a minimum of ${formatPoints(min)} points? The current rule is archived.`, {
    title: 'Activate new rule', confirmText: 'Activate'
  });
  if (!ok) return;

  setLoading(submitBtn, true, 'Saving…');
  const r = await api('/admin/redemption-rules', { method: 'POST', body: { taka_per_point: rate, min_points: Number(min) } });
  setLoading(submitBtn, false);
  if (!r.ok) return showApiError(form, r);
  toast(`Rule #${r.body.data.rule_id} is now active.`, 'success');
  form.reset();
  updateExample();
  load();
});

await load();
