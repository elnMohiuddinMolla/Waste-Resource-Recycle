// Admin reports (prompt.md C14, FR-17, api-spec.md §8.10, database.md §6).
// Five reports with their own filters, a totals row, Print (A4) and CSV export
// built in the browser from the JSON.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { el, $, clear, getParam, formatDate, formatPoints, statusBadge, showFormAlert, clearErrors } from '../ui.js';

const me = await requireRole('admin');
renderHeader(me);

const filters = $('#filters');
let current = null; // { def, data, filters } of the report on screen

// How each report is shown. sum: add the column up in the totals row.
const REPORTS = {
  'weight-by-category': {
    title: 'Weight collected by zone and category',
    note: 'Completed pickups only, by completion date.',
    uses: ['dates', 'zone_id', 'category_id'],
    columns: [
      { key: 'zone_name', label: 'Zone' },
      { key: 'category_name', label: 'Category' },
      { key: 'total_pickups', label: 'Pickups', num: true, sum: true },
      { key: 'total_weight_kg', label: 'Weight (kg)', num: true, sum: true, decimals: true }
    ]
  },
  'request-volume-by-status': {
    title: 'Requests by status',
    note: 'Requests submitted in the period, by their current status.',
    uses: ['dates', 'zone_id'],
    columns: [
      { key: 'status', label: 'Status', badge: true },
      { key: 'request_count', label: 'Requests', num: true, sum: true },
      { key: 'percentage', label: 'Share (%)', num: true, sum: true, decimals: true }
    ]
  },
  'collector-performance': {
    title: 'Collector performance',
    note: 'Rejection rate = rejections ÷ (accepts + rejections) in the period; "—" when the collector made no decision.',
    uses: ['dates', 'zone_id'],
    columns: [
      { key: 'collector_name', label: 'Collector' },
      { key: 'primary_zone', label: 'Zone' },
      { key: 'completed_pickups', label: 'Completed', num: true, sum: true },
      { key: 'total_kg_collected', label: 'Weight (kg)', num: true, sum: true, decimals: true },
      { key: 'rejection_count', label: 'Rejections', num: true, sum: true },
      { key: 'rejection_rate_percentage', label: 'Rejection rate (%)', num: true, decimals: true }
    ]
  },
  'point-liability': {
    title: 'Points issued, redeemed and outstanding',
    note: 'All time (not limited to dates). Cash liability uses the active redemption rule.',
    uses: [],
    keyValue: [
      { key: 'total_points_issued', label: 'Points issued (EARN)' },
      { key: 'total_points_redeemed', label: 'Points redeemed (REDEEM)' },
      { key: 'total_points_refunded', label: 'Points refunded (REFUND)' },
      { key: 'total_points_adjusted', label: 'Weight corrections (ADJUST)' },
      { key: 'net_outstanding_point_liability', label: 'Outstanding points' },
      { key: 'estimated_cash_liability_bdt', label: 'Cash liability (BDT)' }
    ]
  },
  'redemption-summary': {
    title: 'Cash redemptions by status',
    note: 'Redemptions requested in the period.',
    uses: ['dates'],
    columns: [
      { key: 'status', label: 'Status', badge: true },
      { key: 'redemption_count', label: 'Redemptions', num: true, sum: true },
      { key: 'total_points', label: 'Points', num: true, sum: true, decimals: true },
      { key: 'total_cash_bdt', label: 'Cash (BDT)', num: true, sum: true, decimals: true }
    ]
  }
};

// ---------- Filters ----------

function showFiltersFor(type) {
  const uses = REPORTS[type].uses;
  filters.querySelectorAll('[data-filter]').forEach((f) => f.classList.toggle('hidden', !uses.includes(f.dataset.filter)));
}

async function loadOptions() {
  const [zones, cats] = await Promise.all([api('/admin/zones'), api('/admin/categories')]);
  if (zones.ok) zones.body.data.forEach((z) => filters.zone_id.append(el('option', { text: z.name, attrs: { value: z.zone_id } })));
  if (cats.ok) cats.body.data.forEach((c) => filters.category_id.append(el('option', { text: c.name, attrs: { value: c.category_id } })));
}

function filterText(def, f) {
  const parts = [];
  if (def.uses.includes('dates')) parts.push(`${formatDate(f.from)} – ${formatDate(f.to)}`);
  if (def.uses.includes('zone_id')) parts.push(f.zone_id ? `Zone: ${filters.zone_id.selectedOptions[0].text}` : 'All zones');
  if (def.uses.includes('category_id')) parts.push(f.category_id ? `Category: ${filters.category_id.selectedOptions[0].text}` : 'All categories');
  if (!def.uses.length) parts.push('All time');
  return parts.join(' · ');
}

// ---------- Rendering ----------

function cellText(col, value) {
  if (value === null || value === undefined) return '—';
  return col.decimals ? formatPoints(value) : String(value);
}

function sumOf(rows, key) {
  return Math.round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) * 100) / 100;
}

function renderTable(def, rows) {
  const head = clear($('#head'));
  const body = clear($('#body'));

  if (def.keyValue) {
    head.append(el('tr', {}, [el('th', { text: 'Measure' }), el('th', { text: 'Value', className: 'num' })]));
    const row = rows[0] || {};
    for (const kv of def.keyValue) {
      body.append(el('tr', {}, [el('td', { text: kv.label }), el('td', { text: cellText({ decimals: true }, row[kv.key]), className: 'num' })]));
    }
    return;
  }

  head.append(el('tr', {}, def.columns.map((c) => el('th', { text: c.label, className: c.num ? 'num' : '' }))));
  if (rows.length === 0) {
    body.append(el('tr', {}, [el('td', { text: 'No data for these filters.', className: 'empty', attrs: { colspan: def.columns.length } })]));
    return;
  }
  for (const r of rows) {
    body.append(el('tr', {}, def.columns.map((c) => el('td', { className: c.num ? 'num' : '' },
      [c.badge ? statusBadge(r[c.key]) : cellText(c, r[c.key])]))));
  }
  if (def.columns.some((c) => c.sum)) {
    body.append(el('tr', { className: 'total-row' }, def.columns.map((c, i) => {
      if (i === 0) return el('td', { text: 'Total' });
      return el('td', { className: c.num ? 'num' : '', text: c.sum ? cellText(c, sumOf(rows, c.key)) : '' });
    })));
  }
}

async function run() {
  clearErrors(filters);
  const type = filters.type.value;
  const def = REPORTS[type];
  const from = filters.from.value;
  const to = filters.to.value;
  if (def.uses.includes('dates') && from && to && from > to) return showFormAlert(filters, "'To' must not be before 'from'.");

  const params = {};
  if (def.uses.includes('dates')) Object.assign(params, { from, to });
  if (def.uses.includes('zone_id')) params.zone_id = filters.zone_id.value;
  if (def.uses.includes('category_id')) params.category_id = filters.category_id.value;
  history.replaceState(null, '', location.pathname + query({ type, ...params }));

  $('#report-title').textContent = def.title;
  $('#report-filters').textContent = 'Loading…';
  clear($('#head'));
  clear($('#body'));
  $('#print').disabled = true;
  $('#csv').disabled = true;

  const r = await api(`/admin/reports/${type}${query(params)}`);
  if (!r.ok) {
    $('#report-filters').textContent = '';
    return showFormAlert(filters, r.body.message);
  }
  const f = r.body.filters;
  // Show the dates the server actually used (defaults: this month)
  if (f.from) filters.from.value = f.from;
  if (f.to) filters.to.value = f.to;

  current = { type, def, data: r.body.data, filters: f };
  $('#report-filters').textContent = `${filterText(def, f)} · generated ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}`;
  $('#report-note').textContent = def.note;
  renderTable(def, r.body.data);
  $('#print').disabled = false;
  $('#csv').disabled = false;
}

// ---------- CSV export ----------

// Quote fields with commas, quotes or line breaks; stop spreadsheet formulas (CSV injection)
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+@\t\r]/.test(s) || /^-[^0-9.]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv({ def, data }) {
  const lines = [];
  if (def.keyValue) {
    lines.push(['Measure', 'Value']);
    def.keyValue.forEach((kv) => lines.push([kv.label, data[0] ? data[0][kv.key] : '']));
  } else {
    lines.push(def.columns.map((c) => c.label));
    data.forEach((row) => lines.push(def.columns.map((c) => row[c.key])));
    if (data.length && def.columns.some((c) => c.sum)) {
      lines.push(def.columns.map((c, i) => (i === 0 ? 'Total' : c.sum ? sumOf(data, c.key).toFixed(c.decimals ? 2 : 0) : '')));
    }
  }
  // BOM so Excel reads the file as UTF-8
  return '﻿' + lines.map((cols) => cols.map(csvCell).join(',')).join('\r\n');
}

function downloadCsv() {
  if (!current) return;
  const f = current.filters;
  const name = `wrr-${current.type}${f.from ? `-${f.from}_to_${f.to}` : ''}.csv`;
  const url = URL.createObjectURL(new Blob([buildCsv(current)], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { attrs: { href: url, download: name } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Start ----------

filters.type.addEventListener('change', () => { showFiltersFor(filters.type.value); run(); });
filters.addEventListener('submit', (e) => { e.preventDefault(); run(); });
$('#print').addEventListener('click', () => window.print());
$('#csv').addEventListener('click', downloadCsv);

await loadOptions();
const startType = getParam('type');
if (startType && REPORTS[startType]) filters.type.value = startType;
filters.from.value = getParam('from') || '';
filters.to.value = getParam('to') || '';
filters.zone_id.value = getParam('zone_id') || '';
filters.category_id.value = getParam('category_id') || '';
showFiltersFor(filters.type.value);
await run();
