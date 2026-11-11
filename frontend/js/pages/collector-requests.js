// Collector jobs (prompt.md C7, FR-08, FR-10, api-spec.md §4.1–§4.4, §4.6).
// Buttons follow the state machine: Assigned → Accept / Reject,
// Accepted → Record weight / Abort, Collected → Mark as completed.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, getParam, formatDateTime, formatPoints, statusBadge, confirmDialog, reasonDialog,
  toast, setLoading, loadingNode, emptyNode
} from '../ui.js';

const user = await requireRole('collector');
renderHeader(user);

const OPEN = 'Assigned,Accepted,Collected';
const box = $('#jobs');
const state = {
  status: getParam('status') || OPEN,
  zone: getParam('zone_id') || ''
};

function syncUrl() {
  const q = query({ status: state.status === OPEN ? '' : state.status, zone_id: state.zone });
  history.replaceState(null, '', location.pathname + q + location.hash);
}

function markTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.status === state.status)));
}

// Preferred time within the next 3 hours (or already past): highlight the card
function dueSoon(preferredAt) {
  const t = new Date(String(preferredAt).replace(' ', 'T') + '+06:00').getTime();
  return t - Date.now() < 3 * 60 * 60 * 1000;
}

// ---------- Actions ----------

async function run(button, method, path, body, success) {
  setLoading(button, true, 'Saving…');
  const r = await api(path, { method, body });
  setLoading(button, false);
  if (!r.ok) {
    // e.g. 409 when the job changed meanwhile, 404 when it was reassigned
    toast(r.body.message, 'error', 6000);
  } else {
    toast(success(r.body.data), 'success', 6000);
  }
  await load();
}

async function accept(job, button) {
  const ok = await confirmDialog(`Accept job #${job.request_id} for ${formatDateTime(job.preferred_at)}? The household will be told you are coming.`, {
    title: 'Accept job', confirmText: 'Accept'
  });
  if (ok) run(button, 'PUT', `/collector/requests/${job.request_id}/accept`, undefined, () => `Job #${job.request_id} accepted.`);
}

async function reject(job, button) {
  const reason = await reasonDialog({
    title: `Reject job #${job.request_id}`,
    message: 'The job goes back to the admin to be reassigned. Tell them why.',
    placeholder: 'e.g. Vehicle breakdown today',
    confirmText: 'Reject job',
    danger: true
  });
  if (reason) run(button, 'PUT', `/collector/requests/${job.request_id}/reject`, { reason }, () => `Job #${job.request_id} returned to the admin.`);
}

async function abort(job, button) {
  const reason = await reasonDialog({
    title: `Cancel job #${job.request_id} on site`,
    message: 'Use this when the pickup cannot happen (resident absent, unreachable, waste not recyclable). The request will be cancelled.',
    placeholder: 'e.g. Resident absent, phone unreachable after 3 calls',
    confirmText: 'Cancel pickup',
    danger: true
  });
  if (reason) run(button, 'PUT', `/collector/requests/${job.request_id}/abort`, { reason }, () => `Job #${job.request_id} cancelled.`);
}

async function complete(job, button) {
  const ok = await confirmDialog(`Mark job #${job.request_id} as completed? The household's points will be credited now.`, {
    title: 'Complete job', confirmText: 'Mark as completed'
  });
  if (ok) {
    run(button, 'PUT', `/collector/requests/${job.request_id}/complete`, undefined,
      (d) => `Job #${job.request_id} completed — ${formatPoints(d.points_credited)} points credited.`);
  }
}

function actionButtons(job) {
  const btn = (text, cls, handler) => {
    const b = el('button', { text, className: `btn ${cls} btn-small`, attrs: { type: 'button' } });
    b.addEventListener('click', () => handler(job, b));
    return b;
  };
  if (job.status === 'Assigned') return [btn('Accept', 'btn-primary', accept), btn('Reject', 'btn-secondary', reject)];
  if (job.status === 'Accepted') {
    return [
      el('a', { text: 'Record weight', className: 'btn btn-primary btn-small', attrs: { href: `/collector/record-weight.html?id=${job.request_id}` } }),
      btn('Cancel on site', 'btn-secondary', abort)
    ];
  }
  if (job.status === 'Collected') return [btn('Mark as completed', 'btn-primary', complete)];
  return [];
}

// ---------- List ----------

function detailRow(label, value) {
  return [el('dt', { text: label }), el('dd', {}, [value])];
}

function renderJob(job) {
  const soon = job.status !== 'Collected' && dueSoon(job.preferred_at);
  return el('article', { className: `card job-card${soon ? ' due-soon' : ''}`, attrs: { id: `job-${job.request_id}` } }, [
    el('div', { className: 'job-head' }, [
      el('div', {}, [
        el('h3', { text: `#${job.request_id} · ${job.category_name}` }),
        el('div', { className: 'muted small', text: `${formatDateTime(job.preferred_at)}${soon ? ' · due soon' : ''}` })
      ]),
      statusBadge(job.status)
    ]),
    el('dl', { className: 'details' }, [
      ...detailRow('Household', job.user_name),
      ...detailRow('Phone', el('a', { text: job.contact_phone, className: 'phone-link', attrs: { href: `tel:${job.contact_phone}` } })),
      ...detailRow('Address', job.pickup_address),
      ...detailRow('Zone', job.zone_name),
      ...detailRow('Estimated', `${job.estimated_weight_kg} kg`),
      ...(job.other_description ? detailRow('Description', job.other_description) : [])
    ]),
    el('div', { className: 'job-actions' }, actionButtons(job))
  ]);
}

async function loadZones() {
  const r = await api('/zones');
  if (!r.ok) return;
  const select = $('#zone');
  for (const z of r.body.data) select.append(el('option', { text: z.name, attrs: { value: z.zone_id } }));
  select.value = state.zone;
}

async function load() {
  syncUrl();
  markTabs();
  clear(box).append(loadingNode());
  const r = await api(`/collector/requests${query({ status: state.status, zone_id: state.zone })}`);
  clear(box);
  if (!r.ok) {
    $('#count').textContent = '';
    return box.append(emptyNode(r.body.message));
  }
  const jobs = r.body.data;
  $('#count').textContent = `${jobs.length} job${jobs.length === 1 ? '' : 's'}`;
  if (jobs.length === 0) return box.append(emptyNode('No jobs here right now.'));
  jobs.forEach((job) => box.append(renderJob(job)));

  // Coming from a notification link (#job-12): bring that card into view
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => { state.status = tab.dataset.status; load(); });
});
$('#zone').addEventListener('change', (e) => { state.zone = e.target.value; load(); });
$('#refresh').addEventListener('click', load);

await loadZones();
await load();
