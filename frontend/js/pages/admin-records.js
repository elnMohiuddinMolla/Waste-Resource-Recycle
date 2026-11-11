// Admin collection records + weight correction (prompt.md C13, FR-18, api-spec.md §8.5).
// Change = ROUND(new kg × rate, 2) − points already posted for the record.
// The server refuses (422) if the user's balance would go below zero.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, getParam, formatDateTime, formatPoints, statusBadge, formDialog, toast, showFormAlert, clearErrors
} from '../ui.js';

const me = await requireRole('admin');
renderHeader(me);

const PAGE_SIZE = 20;
const filters = $('#filters');
const tbody = $('#rows');
const state = { from: getParam('from') || '', to: getParam('to') || '', zone_id: getParam('zone_id') || '', page: 1 };

// Same maths as the server, in whole hundredths to avoid float drift
function change(newKg, rate, posted) {
  const target = Math.round(Number(newKg) * Number(rate) * 100);
  return (target - Math.round(Number(posted) * 100)) / 100;
}

function messageRow(text) {
  clear(tbody).append(el('tr', {}, [el('td', { text, className: 'empty', attrs: { colspan: 9 } })]));
}

async function correct(rec) {
  const r = await formDialog({
    title: `Correct record #${rec.record_id}`,
    intro: `${rec.user_name} · ${rec.category_name} · now ${rec.actual_weight_kg} kg at ${rec.points_per_kg_applied} points/kg (${formatPoints(rec.points_posted)} points posted).`,
    fields: [
      { name: 'actual_weight_kg', label: 'Correct weight (kg)', type: 'number', value: rec.actual_weight_kg,
        attrs: { min: '0.01', step: '0.01', inputmode: 'decimal', required: true } },
      { name: 'remarks', label: 'Remarks (optional)', type: 'textarea', attrs: { maxlength: 1000, placeholder: 'e.g. Checked the scale ticket' },
        hint: 'Leave empty to keep the current remarks.' }
    ],
    confirmText: 'Save correction',
    // Live preview of the ledger change
    onChange: (v, box) => {
      const kg = Number(v.actual_weight_kg);
      box.classList.remove('hidden');
      if (!(kg > 0)) { box.textContent = 'Enter a weight above 0 kg.'; return; }
      const delta = change(kg, rec.points_per_kg_applied, rec.points_posted);
      const total = Math.round(kg * Number(rec.points_per_kg_applied) * 100) / 100;
      box.textContent = delta === 0
        ? 'No change in points.'
        : `${delta > 0 ? '+' : ''}${formatPoints(delta)} points to ${rec.user_name} (new total for this pickup: ${formatPoints(total)}).`;
    },
    onSubmit: (v) => {
      const body = { actual_weight_kg: v.actual_weight_kg === '' ? '' : Number(v.actual_weight_kg) };
      if (v.remarks) body.remarks = v.remarks;
      return api(`/admin/collection-records/${rec.record_id}`, { method: 'PUT', body });
    }
  });
  if (!r) return;
  const d = r.body.data;
  toast(`Record #${d.record_id}: ${d.corrected_weight_kg} kg, ${Number(d.point_adjustment) > 0 ? '+' : ''}${formatPoints(d.point_adjustment)} points.`, 'success', 6000);
  load();
}

function renderRow(rec) {
  let action = null;
  if (rec.request_status === 'Completed') {
    action = el('button', { text: 'Correct weight', className: 'btn btn-secondary btn-small', attrs: { type: 'button' } });
    action.addEventListener('click', () => correct(rec));
  } else {
    action = statusBadge(rec.request_status); // weighed but not completed yet
  }
  return el('tr', {}, [
    el('td', {}, [
      el('div', { text: `#${rec.record_id}` }),
      el('a', { text: `Request #${rec.request_id}`, className: 'small', attrs: { href: `/admin/requests.html?status=all&id=${rec.request_id}` } })
    ]),
    el('td', { text: rec.user_name }),
    el('td', { text: rec.collector_name }),
    el('td', {}, [el('div', { text: rec.category_name }), el('div', { text: rec.zone_name, className: 'muted small' })]),
    el('td', { text: `${rec.actual_weight_kg} kg`, className: 'num' }),
    el('td', { text: rec.points_per_kg_applied, className: 'num' }),
    el('td', { text: formatPoints(rec.points_posted), className: 'num' }),
    el('td', {}, [
      el('div', { text: formatDateTime(rec.collected_at) }),
      rec.remarks ? el('div', { text: rec.remarks, className: 'muted small' }) : null
    ]),
    el('td', {}, [action])
  ]);
}

async function load() {
  history.replaceState(null, '', location.pathname + query({ from: state.from, to: state.to, zone_id: state.zone_id }));
  messageRow('Loading…');
  const r = await api(`/admin/collection-records${query({ ...state, limit: PAGE_SIZE })}`);
  if (!r.ok) return messageRow(r.body.message);

  const { total, records } = r.body.data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('#count').textContent = `${total} record${total === 1 ? '' : 's'} · newest first`;
  $('#pager').classList.toggle('hidden', pages <= 1);
  $('#page-info').textContent = `Page ${state.page} of ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;

  if (records.length === 0) return messageRow('No collection records for these filters.');
  clear(tbody);
  records.forEach((rec) => tbody.append(renderRow(rec)));
}

async function loadZones() {
  const r = await api('/admin/zones');
  if (!r.ok) return;
  for (const z of r.body.data) filters.zone_id.append(el('option', { text: z.name, attrs: { value: z.zone_id } }));
}

filters.addEventListener('submit', (e) => {
  e.preventDefault();
  clearErrors(filters);
  const from = filters.from.value;
  const to = filters.to.value;
  if (from && to && from > to) return showFormAlert(filters, "'To' must not be before 'from'.");
  Object.assign(state, { from, to, zone_id: filters.zone_id.value, page: 1 });
  load();
});
$('#reset').addEventListener('click', () => {
  filters.reset();
  clearErrors(filters);
  Object.assign(state, { from: '', to: '', zone_id: '', page: 1 });
  load();
});
$('#prev').addEventListener('click', () => { state.page -= 1; load(); });
$('#next').addEventListener('click', () => { state.page += 1; load(); });

await loadZones();
filters.from.value = state.from;
filters.to.value = state.to;
filters.zone_id.value = state.zone_id;
await load();
