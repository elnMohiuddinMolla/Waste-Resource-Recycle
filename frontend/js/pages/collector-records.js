// Collector history (prompt.md C8, FR-12, api-spec.md §4.7): completed collections
// with date range and category filters, totals and paging.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { el, $, clear, getParam, formatDateTime, formatPoints, showFormAlert, clearErrors } from '../ui.js';

const user = await requireRole('collector');
renderHeader(user);

const PAGE_SIZE = 15;
const filters = $('#filters');
const tbody = $('#rows');
const state = {
  from: getParam('from') || '',
  to: getParam('to') || '',
  category_id: getParam('category_id') || '',
  page: 1
};

function messageRow(text) {
  clear(tbody).append(el('tr', {}, [el('td', { text, className: 'empty', attrs: { colspan: 7 } })]));
}

async function loadCategories() {
  const r = await api('/categories');
  if (!r.ok) return;
  for (const c of r.body.data) filters.category_id.append(el('option', { text: c.name, attrs: { value: c.category_id } }));
}

async function load() {
  history.replaceState(null, '', location.pathname + query({ from: state.from, to: state.to, category_id: state.category_id }));
  messageRow('Loading…');
  const r = await api(`/collector/history${query({ ...state, limit: PAGE_SIZE })}`);
  if (!r.ok) return messageRow(r.body.message);

  const { summary, records } = r.body.data;
  $('#sum-count').textContent = summary.total_completed_pickups;
  $('#sum-kg').textContent = `${summary.total_kg_collected} kg`;

  const pages = Math.max(1, Math.ceil(summary.total_completed_pickups / PAGE_SIZE));
  $('#pager').classList.toggle('hidden', pages <= 1);
  $('#page-info').textContent = `Page ${state.page} of ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;

  if (records.length === 0) return messageRow('No completed collections for these filters.');
  clear(tbody);
  for (const x of records) {
    // The household's points for this collection: weight × the rate saved when weighed
    const pts = Math.round(Number(x.actual_weight_kg) * Number(x.points_per_kg_applied) * 100) / 100;
    tbody.append(el('tr', {}, [
      el('td', { text: formatDateTime(x.completed_at) }),
      el('td', { text: `#${x.request_id}` }),
      el('td', { text: x.user_name }),
      el('td', { text: x.category_name }),
      el('td', { text: `${x.actual_weight_kg} kg`, className: 'num' }),
      el('td', { text: `${x.points_per_kg_applied}/kg`, className: 'num' }),
      el('td', { text: formatPoints(pts), className: 'num' })
    ]));
  }
}

filters.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(filters);
  const from = filters.from.value;
  const to = filters.to.value;
  if (from && to && from > to) return showFormAlert(filters, "'To' must not be before 'from'.");
  Object.assign(state, { from, to, category_id: filters.category_id.value, page: 1 });
  load();
});

$('#reset').addEventListener('click', () => {
  Object.assign(state, { from: '', to: '', category_id: '', page: 1 });
  filters.reset();
  clearErrors(filters);
  load();
});

$('#prev').addEventListener('click', () => { state.page -= 1; load(); });
$('#next').addEventListener('click', () => { state.page += 1; load(); });

await loadCategories();
filters.from.value = state.from;
filters.to.value = state.to;
filters.category_id.value = state.category_id;
await load();
