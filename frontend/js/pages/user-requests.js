// My requests (prompt.md C5, FR-05, FR-06, FR-12, api-spec.md §3.2–§3.4):
// filtered, paged list; details with the full status timeline; cancel while Pending.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, getParam, formatDateTime, formatPoints, statusBadge, confirmDialog, toast,
  setLoading, showFormAlert, clearErrors, loadingNode, emptyNode, requestPhoto } from '../ui.js';

const user = await requireRole('user');
renderHeader(user);

const PAGE_SIZE = 10;
const filtersForm = $('#filters');
const listBox = $('#list');
const detailBox = $('#detail');

const state = {
  status: getParam('status') || '',
  category_id: getParam('category_id') || '',
  from: getParam('from') || '',
  to: getParam('to') || '',
  page: Number(getParam('page')) || 1,
  selected: Number(getParam('id')) || null
};

// Keep the address bar in step, so refresh / back / sharing a link keep the view
function syncUrl() {
  const q = query({ status: state.status, category_id: state.category_id, from: state.from, to: state.to,
    page: state.page > 1 ? state.page : '', id: state.selected || '' });
  history.replaceState(null, '', location.pathname + q);
}

// ---------- Filters ----------

async function loadCategories() {
  const r = await api('/categories');
  if (!r.ok) return;
  for (const c of r.body.data) {
    filtersForm.category_id.append(el('option', { text: c.name, attrs: { value: c.category_id } }));
  }
}

function writeFilters() {
  filtersForm.status.value = state.status;
  filtersForm.category_id.value = state.category_id;
  filtersForm.from.value = state.from;
  filtersForm.to.value = state.to;
}

filtersForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(filtersForm);
  const from = filtersForm.from.value;
  const to = filtersForm.to.value;
  if (from && to && from > to) return showFormAlert(filtersForm, "'To' must not be before 'from'.");
  Object.assign(state, { status: filtersForm.status.value, category_id: filtersForm.category_id.value, from, to, page: 1 });
  loadList();
});

$('#reset').addEventListener('click', () => {
  Object.assign(state, { status: '', category_id: '', from: '', to: '', page: 1 });
  writeFilters();
  clearErrors(filtersForm);
  loadList();
});

// ---------- List ----------

function renderRow(req) {
  const a = el('a', {
    className: `list-item${req.request_id === state.selected ? ' selected' : ''}`,
    attrs: { href: `?id=${req.request_id}`, 'data-id': req.request_id }
  }, [
    el('div', { className: 'main' }, [
      el('div', { className: 'title', text: `#${req.request_id} · ${req.category_name}` }),
      el('div', {
        className: 'meta',
        text: `Pickup ${formatDateTime(req.preferred_at)} · ${req.actual_weight_kg ? `${req.actual_weight_kg} kg weighed` : `${req.estimated_weight_kg} kg estimated`}`
      })
    ]),
    statusBadge(req.status)
  ]);
  a.addEventListener('click', (event) => {
    event.preventDefault();
    selectRequest(req.request_id, true);
  });
  return el('li', {}, [a]);
}

async function loadList() {
  syncUrl();
  clear(listBox).append(loadingNode());
  const r = await api(`/pickup-requests/mine${query({
    status: state.status, category_id: state.category_id, from: state.from, to: state.to, page: state.page, limit: PAGE_SIZE
  })}`);
  clear(listBox);
  if (!r.ok) {
    $('#count').textContent = '';
    $('#pager').classList.add('hidden');
    return listBox.append(emptyNode(r.body.message));
  }

  const { total, requests } = r.body.data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('#count').textContent = `${total} request${total === 1 ? '' : 's'}`;

  if (requests.length === 0) {
    listBox.append(emptyNode(total === 0 && !state.status && !state.category_id && !state.from && !state.to
      ? 'You have not made any requests yet.'
      : 'No requests match these filters.'));
  } else {
    const list = el('ul', { className: 'list' });
    requests.forEach((req) => list.append(renderRow(req)));
    listBox.append(list);
  }

  $('#pager').classList.toggle('hidden', pages <= 1);
  $('#page-info').textContent = `Page ${state.page} of ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;
}

$('#prev').addEventListener('click', () => { state.page -= 1; loadList(); });
$('#next').addEventListener('click', () => { state.page += 1; loadList(); });

// ---------- Details ----------

function row(label, value) {
  return [el('dt', { text: label }), el('dd', {}, [value === null || value === undefined || value === '' ? '—' : value])];
}

function renderTimeline(timeline) {
  const ol = el('ol', { className: 'timeline' });
  for (const t of timeline) {
    ol.append(el('li', {}, [
      el('div', {}, [statusBadge(t.new_status)]),
      el('div', { className: 'when', text: `${formatDateTime(t.changed_at)} · ${t.changed_by}` }),
      t.note ? el('div', { className: 'note', text: t.note }) : null
    ]));
  }
  return ol;
}

async function cancelRequest(req, button) {
  const ok = await confirmDialog(`Cancel request #${req.request_id}? This cannot be undone.`, {
    title: 'Cancel request', confirmText: 'Yes, cancel it', cancelText: 'Keep it', danger: true
  });
  if (!ok) return;
  setLoading(button, true, 'Cancelling…');
  const r = await api(`/pickup-requests/${req.request_id}/cancel`, { method: 'PUT' });
  setLoading(button, false);
  if (!r.ok) {
    toast(r.body.message, 'error', 6000); // e.g. 409: a collector was assigned in the meantime
  } else {
    toast(`Request #${req.request_id} cancelled.`, 'success');
  }
  await Promise.all([loadList(), selectRequest(req.request_id, false)]);
}

function renderDetail(req) {
  clear(detailBox);
  const collector = req.collector
    ? el('span', {}, [`${req.collector.name} · `, el('a', { text: req.collector.phone, attrs: { href: `tel:${req.collector.phone}` } })])
    : 'Not assigned yet';

  detailBox.append(
    el('div', { className: 'row row-between mb-2' }, [
      el('h2', { text: `Request #${req.request_id}`, className: 'mb-0' }),
      statusBadge(req.status)
    ]),
    requestPhoto(req.request_id, req.has_photo),
    el('dl', { className: 'details' }, [
      ...row('Category', req.category_name),
      ...(req.other_description ? row('Description', req.other_description) : []),
      ...row('Estimated', `${req.estimated_weight_kg} kg`),
      ...row('Actual weight', req.actual_weight_kg ? `${req.actual_weight_kg} kg` : null),
      ...row('Rate', `${req.points_per_kg} points/kg`),
      ...row('Points earned', req.points_earned ? formatPoints(req.points_earned) : null),
      ...row('Preferred time', formatDateTime(req.preferred_at)),
      ...row('Zone', req.zone_name),
      ...row('Address', req.pickup_address),
      ...row('Contact phone', req.contact_phone),
      ...row('Collector', collector),
      ...row('Submitted', formatDateTime(req.created_at))
    ])
  );

  // FR-06: the owner can cancel only while the request is Pending
  if (req.status === 'Pending') {
    const btn = el('button', { text: 'Cancel request', className: 'btn btn-danger btn-small mt-2', attrs: { type: 'button' } });
    btn.addEventListener('click', () => cancelRequest(req, btn));
    detailBox.append(btn);
  }

  detailBox.append(el('h3', { text: 'Timeline', className: 'mt-3' }), renderTimeline(req.timeline));
}

async function selectRequest(id, scroll) {
  state.selected = id;
  syncUrl();
  listBox.querySelectorAll('a.list-item').forEach((a) => a.classList.toggle('selected', Number(a.dataset.id) === id));
  clear(detailBox).append(loadingNode());
  const r = await api(`/pickup-requests/${id}`);
  if (!r.ok) {
    clear(detailBox).append(emptyNode(r.body.message));
    return;
  }
  renderDetail(r.body.data);
  // On phones the panel is below the list: bring it into view
  if (scroll && window.matchMedia('(max-width: 959px)').matches) detailBox.scrollIntoView({ behavior: 'smooth' });
}

// ---------- Start ----------

await loadCategories();
writeFilters();
await loadList();
if (state.selected) await selectRequest(state.selected, true);
