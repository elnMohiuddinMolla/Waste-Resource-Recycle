// Admin request queue (prompt.md C10, FR-07, api-spec.md §8.1, §8.2):
// filter by status and zone, see details and timeline, assign or reassign a collector.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, getParam, formatDateTime, formatPoints, statusBadge, toast, setLoading, loadingNode, emptyNode, requestPhoto } from '../ui.js';

const user = await requireRole('admin');
renderHeader(user);

const PAGE_SIZE = 20;
const listBox = $('#list');
const detailBox = $('#detail');
const state = {
  status: getParam('status') ?? 'Pending',
  zone: getParam('zone_id') || '',
  page: 1,
  selected: Number(getParam('id')) || null
};

function syncUrl() {
  history.replaceState(null, '', location.pathname + query({ status: state.status || 'all', zone_id: state.zone, id: state.selected || '' }));
}
if (state.status === 'all') state.status = '';

function markTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.status === state.status)));
}

// ---------- Assign / reassign (T1, T2) ----------

async function activeCollectors() {
  const r = await api('/admin/users?role=collector&status=active&limit=50');
  return r.ok ? r.body.data.users : [];
}

/**
 * Lets the admin pick a collector: same-zone collectors first, each with their
 * number of open jobs. Resolves the chosen collector_id, or null if cancelled.
 */
async function chooseCollector(req) {
  const collectors = (await activeCollectors()).sort((a, b) =>
    (b.zone_name === req.zone_name) - (a.zone_name === req.zone_name) || a.open_jobs - b.open_jobs || a.full_name.localeCompare(b.full_name));

  return new Promise((resolve) => {
    const close = (answer) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(answer); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const error = el('div', { className: 'field-error' });

    const items = collectors.map((c, i) => el('li', { className: 'choice' }, [
      el('label', {}, [
        el('input', { attrs: { type: 'radio', name: 'collector', value: c.user_id, checked: i === 0 } }),
        el('span', {}, [
          c.full_name,
          c.zone_name === req.zone_name ? el('span', { text: 'same zone', className: 'tag' }) : null,
          el('div', { className: 'muted small', text: `${c.zone_name || 'No zone'} · ${c.open_jobs} open job${c.open_jobs === 1 ? '' : 's'} · ${c.phone}` })
        ])
      ])
    ]));

    const form = el('form', { attrs: { novalidate: true } }, [
      el('p', { className: 'mb-0', text: `Request #${req.request_id}: ${req.category_name}, ${req.zone_name}, ${formatDateTime(req.preferred_at)}.` }),
      collectors.length
        ? el('ul', { className: 'choices' }, items)
        : el('p', { className: 'alert alert-warning mt-1', text: 'There are no active collectors. Create or reactivate one first.' }),
      error,
      el('div', { className: 'modal-actions' }, [
        el('button', { text: 'Cancel', className: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el('button', { text: req.status === 'Rejected' ? 'Reassign' : 'Assign', className: 'btn btn-primary', attrs: { type: 'submit', disabled: !collectors.length } })
      ])
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const picked = form.querySelector('input[name="collector"]:checked');
      if (!picked) { error.textContent = 'Choose a collector.'; return; }
      close(Number(picked.value));
    });

    const backdrop = el('div', { className: 'modal-backdrop', on: { click: (e) => { if (e.target === backdrop) close(null); } } }, [
      el('div', { className: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
        el('h2', { text: req.status === 'Rejected' ? 'Reassign collector' : 'Assign a collector' }),
        form
      ])
    ]);
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    const first = form.querySelector('input');
    if (first) first.focus();
  });
}

async function assign(req, button) {
  const collectorId = await chooseCollector(req);
  if (!collectorId) return;
  setLoading(button, true, 'Assigning…');
  const r = await api(`/admin/pickup-requests/${req.request_id}/assign`, { method: 'PUT', body: { collector_id: collectorId } });
  setLoading(button, false);
  if (!r.ok) toast(r.body.message, 'error', 6000); // e.g. 409 when the user cancelled meanwhile
  else toast(`Request #${req.request_id} assigned.`, 'success');
  await Promise.all([loadList(), selectRequest(req.request_id)]);
}

// ---------- Details ----------

function row(label, value) {
  return [el('dt', { text: label }), el('dd', {}, [value === null || value === undefined || value === '' ? '—' : value])];
}

function renderDetail(req) {
  clear(detailBox);
  const lastRejection = [...req.timeline].reverse().find((t) => t.new_status === 'Rejected');

  detailBox.append(
    el('div', { className: 'row row-between mb-2' }, [el('h2', { text: `Request #${req.request_id}`, className: 'mb-0' }), statusBadge(req.status)])
  );
  if (req.status === 'Rejected' && lastRejection) {
    detailBox.append(el('div', {
      className: 'alert alert-warning mb-2',
      text: `Rejected by ${lastRejection.changed_by}: ${lastRejection.note || 'no reason given'}`
    }));
  }
  detailBox.append(requestPhoto(req.request_id, req.has_photo));
  detailBox.append(el('dl', { className: 'details' }, [
    ...row('Household', req.user_name),
    ...row('Phone', el('a', { text: req.contact_phone, attrs: { href: `tel:${req.contact_phone}` } })),
    ...row('Address', req.pickup_address),
    ...row('Zone', req.zone_name),
    ...row('Category', req.category_name),
    ...(req.other_description ? row('Description', req.other_description) : []),
    ...row('Estimated', `${req.estimated_weight_kg} kg`),
    ...row('Actual weight', req.actual_weight_kg ? `${req.actual_weight_kg} kg` : null),
    ...row('Points earned', req.points_earned ? formatPoints(req.points_earned) : null),
    ...row('Preferred time', formatDateTime(req.preferred_at)),
    ...row('Collector', req.collector ? `${req.collector.name} · ${req.collector.phone}` : 'Not assigned'),
    ...row('Submitted', formatDateTime(req.created_at))
  ]));

  if (req.status === 'Pending' || req.status === 'Rejected') {
    const btn = el('button', {
      text: req.status === 'Rejected' ? 'Reassign collector' : 'Assign collector',
      className: 'btn btn-primary mt-2',
      attrs: { type: 'button' }
    });
    btn.addEventListener('click', () => assign(req, btn));
    detailBox.append(btn);
  }

  const timeline = el('ol', { className: 'timeline' });
  for (const t of req.timeline) {
    timeline.append(el('li', {}, [
      el('div', {}, [statusBadge(t.new_status)]),
      el('div', { className: 'when', text: `${formatDateTime(t.changed_at)} · ${t.changed_by}` }),
      t.note ? el('div', { className: 'note', text: t.note }) : null
    ]));
  }
  detailBox.append(el('h3', { text: 'Timeline', className: 'mt-3' }), timeline);
}

async function selectRequest(id, scroll = false) {
  state.selected = id;
  syncUrl();
  listBox.querySelectorAll('a.list-item').forEach((a) => a.classList.toggle('selected', Number(a.dataset.id) === id));
  clear(detailBox).append(loadingNode());
  const r = await api(`/pickup-requests/${id}`);
  if (!r.ok) return clear(detailBox).append(emptyNode(r.body.message));
  renderDetail(r.body.data);
  if (scroll && window.matchMedia('(max-width: 959px)').matches) detailBox.scrollIntoView({ behavior: 'smooth' });
}

// ---------- List ----------

function renderRow(req) {
  const a = el('a', {
    className: `list-item${req.request_id === state.selected ? ' selected' : ''}`,
    attrs: { href: `?id=${req.request_id}`, 'data-id': req.request_id }
  }, [
    el('div', { className: 'main' }, [
      el('div', { className: 'title', text: `#${req.request_id} · ${req.category_name} · ${req.estimated_weight_kg} kg` }),
      el('div', { className: 'meta', text: `${req.user_name} · ${req.zone_name}` }),
      el('div', { className: 'meta', text: `Pickup ${formatDateTime(req.preferred_at)}${req.collector_name ? ` · ${req.collector_name}` : ''}` })
    ]),
    statusBadge(req.status)
  ]);
  a.addEventListener('click', (e) => { e.preventDefault(); selectRequest(req.request_id, true); });
  return el('li', {}, [a]);
}

async function loadList() {
  syncUrl();
  markTabs();
  clear(listBox).append(loadingNode());
  const r = await api(`/admin/pickup-requests${query({ status: state.status, zone_id: state.zone, page: state.page, limit: PAGE_SIZE })}`);
  clear(listBox);
  if (!r.ok) return listBox.append(emptyNode(r.body.message));

  const { total, requests } = r.body.data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('#count').textContent = `${total} request${total === 1 ? '' : 's'}${state.status ? ` · ${state.status}` : ''} · soonest pickup first`;
  if (requests.length === 0) listBox.append(emptyNode('Nothing here.'));
  else {
    const list = el('ul', { className: 'list' });
    requests.forEach((req) => list.append(renderRow(req)));
    listBox.append(list);
  }
  $('#pager').classList.toggle('hidden', pages <= 1);
  $('#page-info').textContent = `Page ${state.page} of ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;
}

async function loadZones() {
  const r = await api('/admin/zones');
  if (!r.ok) return;
  for (const z of r.body.data) {
    $('#zone').append(el('option', { text: z.is_active ? z.name : `${z.name} (inactive)`, attrs: { value: z.zone_id } }));
  }
  $('#zone').value = state.zone;
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => { state.status = tab.dataset.status; state.page = 1; loadList(); });
});
$('#zone').addEventListener('change', (e) => { state.zone = e.target.value; state.page = 1; loadList(); });
$('#refresh').addEventListener('click', () => { loadList(); if (state.selected) selectRequest(state.selected); });
$('#prev').addEventListener('click', () => { state.page -= 1; loadList(); });
$('#next').addEventListener('click', () => { state.page += 1; loadList(); });

await loadZones();
await loadList();
if (state.selected) await selectRequest(state.selected, true);
