// Record weight and complete (prompt.md C8, FR-09, FR-10, api-spec.md §4.5–§4.6,
// requirement-validation E-04 / E-05).
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, getParam, formatDateTime, formatPoints, statusBadge, confirmDialog, toast,
  setLoading, clearErrors, showFieldErrors, showApiError, emptyNode
} from '../ui.js';

const user = await requireRole('collector');
renderHeader(user);

const id = Number(getParam('id'));
const form = $('#weigh-form');
const saveBtn = form.querySelector('button[type="submit"]');
const DRAFT_KEY = `wrr:weigh:${id}`;
let job = null;

// ---------- Draft kept on the phone until the server confirms (E-04) ----------
// Browser storage can be missing or blocked, so every use is wrapped.

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ weight: form.actual_weight_kg.value, remarks: form.remarks.value }));
  } catch { /* storage unavailable: nothing to keep */ }
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && (d.weight || d.remarks)) {
      form.actual_weight_kg.value = d.weight || '';
      form.remarks.value = d.remarks || '';
      $('#draft-note').textContent = 'Restored what you typed earlier (not saved to the server yet).';
    }
  } catch { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ---------- Display ----------

function points(kg, rate) {
  return Math.round(kg * Number(rate) * 100) / 100;
}

function updatePreview() {
  const kg = Number(form.actual_weight_kg.value);
  if (!(kg > 0)) {
    $('#preview').textContent = '—';
    $('#preview-note').textContent = 'Enter the weight.';
    return;
  }
  $('#preview').textContent = `${formatPoints(points(kg, job.points_per_kg))} points`;
  $('#preview-note').textContent = `${kg} kg × ${job.points_per_kg} points/kg (today's ${job.category_name} rate)`;
}

function detail(label, value) {
  return [el('dt', { text: label }), el('dd', {}, [value || '—'])];
}

function renderJob() {
  $('#title').textContent = `Job #${job.request_id}`;
  clear($('#job')).append(
    el('div', { className: 'row row-between mb-2' }, [el('h2', { text: job.category_name, className: 'mb-0' }), statusBadge(job.status)]),
    el('dl', { className: 'details' }, [
      ...detail('Household', job.user_name),
      ...detail('Phone', el('a', { text: job.contact_phone, className: 'phone-link', attrs: { href: `tel:${job.contact_phone}` } })),
      ...detail('Address', job.pickup_address),
      ...detail('Zone', job.zone_name),
      ...detail('Preferred time', formatDateTime(job.preferred_at)),
      ...detail('Estimated', `${job.estimated_weight_kg} kg`),
      ...(job.other_description ? detail('Description', job.other_description) : []),
      ...detail('Rate', `${job.points_per_kg} points/kg`)
    ])
  );
}

function show(cardId) {
  ['weigh-card', 'complete-card', 'done-card', 'other-card'].forEach((c) => $(`#${c}`).classList.toggle('hidden', c !== cardId));
}

function showStep() {
  renderJob();
  if (job.status === 'Accepted') {
    show('weigh-card');
    loadDraft();
    updatePreview();
    form.actual_weight_kg.focus();
  } else if (job.status === 'Collected') {
    $('#weighed-text').textContent =
      `Weighed: ${job.actual_weight_kg} kg × ${job.points_per_kg} points/kg = ${formatPoints(points(job.actual_weight_kg, job.points_per_kg))} points.`;
    show('complete-card');
  } else if (job.status === 'Completed') {
    $('#done-text').textContent = `${job.actual_weight_kg} kg collected. ${formatPoints(job.points_earned)} points were credited to ${job.user_name}.`;
    show('done-card');
  } else {
    $('#other-text').textContent = job.status === 'Assigned'
      ? 'Accept this job first, on the My jobs page.'
      : `This job is ${job.status}; there is nothing to record.`;
    show('other-card');
  }
}

async function loadJob() {
  const r = await api(`/pickup-requests/${id}`);
  if (!r.ok) {
    clear($('#job')).append(emptyNode(id ? r.body.message : 'No job selected.'));
    $('#other-text').textContent = 'Open a job from the My jobs page.';
    show('other-card');
    return false;
  }
  job = r.body.data;
  showStep();
  return true;
}

// ---------- Actions ----------

form.actual_weight_kg.addEventListener('input', () => { saveDraft(); updatePreview(); });
form.remarks.addEventListener('input', saveDraft);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);
  const kg = Math.round(Number(form.actual_weight_kg.value) * 100) / 100;
  if (!(kg > 0)) return showFieldErrors(form, [{ field: 'actual_weight_kg', message: 'Actual weight must be greater than 0 kg.' }]);

  setLoading(saveBtn, true, 'Saving…');
  const r = await api('/collector/collection-records', {
    method: 'POST',
    body: { request_id: id, actual_weight_kg: kg, remarks: form.remarks.value.trim() }
  });
  setLoading(saveBtn, false);

  if (!r.ok) {
    if (r.status === 409 || r.status === 404) { toast(r.body.message, 'error', 6000); await loadJob(); return; }
    return showApiError(form, r);
  }
  clearDraft();
  toast(`Saved: ${r.body.data.actual_weight_kg} kg = ${formatPoints(r.body.data.calculated_points)} points.`, 'success');
  await loadJob();
});

$('#complete').addEventListener('click', async (event) => {
  const btn = event.currentTarget;
  const ok = await confirmDialog(`Mark job #${id} as completed? ${job.user_name} gets the points now.`, {
    title: 'Complete job', confirmText: 'Mark as completed'
  });
  if (!ok) return;
  setLoading(btn, true, 'Completing…');
  const r = await api(`/collector/requests/${id}/complete`, { method: 'PUT' });
  setLoading(btn, false);
  if (!r.ok) toast(r.body.message, 'error', 6000);
  else toast(`Completed — ${formatPoints(r.body.data.points_credited)} points credited.`, 'success', 6000);
  await loadJob();
});

await loadJob();
