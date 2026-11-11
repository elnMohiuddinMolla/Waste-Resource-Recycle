// New pickup request (prompt.md C4, FR-03, api-spec.md §3.1).
// The checks here mirror the server's for quick feedback; the server's own
// errors are always shown too.
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { fillIcons } from '../icons.js';
import { el, $, clear, clearErrors, showFieldErrors, showFormAlert, showApiError, setLoading, formatPoints, formatDateTime, toast } from '../ui.js';

const user = await requireRole('user');
renderHeader(user);

fillIcons();
const form = $('#request-form');
const button = form.querySelector('button[type="submit"]');
const otherField = $('#other-field');
const PHONE = /^(?:\+8801|01)[3-9]\d{8}$/;
let categories = [];
let photoData = null; // the chosen photo, made smaller, as a data URL

const PHOTO_MAX_SIDE = 1280;  // longest side in pixels after shrinking
const PHOTO_QUALITY = 0.82;   // JPEG quality

// "Now" in Bangladesh time as YYYY-MM-DDTHH:mm, for the datetime-local minimum
function bdNow() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function selectedCategory() {
  return categories.find((c) => String(c.category_id) === form.category_id.value) || null;
}

// "Other" needs a description; show the box only then
function updateOtherField() {
  const c = selectedCategory();
  const show = Boolean(c && c.is_other);
  otherField.classList.toggle('hidden', !show);
  form.other_description.required = show;
}

function updateEstimate() {
  const c = selectedCategory();
  const kg = Number(form.estimated_weight_kg.value);
  if (!c || !(kg > 0)) {
    $('#estimate').textContent = '—';
    $('#estimate-note').textContent = 'Choose a category and enter the weight.';
    return;
  }
  const points = Math.round(kg * Number(c.points_per_kg) * 100) / 100;
  $('#estimate').textContent = `≈ ${formatPoints(points)} points`;
  $('#estimate-note').textContent = `${kg} kg × ${c.points_per_kg} points/kg (${c.name})`;
}

async function loadOptions() {
  const [cats, zones] = await Promise.all([api('/categories'), api('/zones')]);

  clear(form.category_id);
  if (cats.ok) {
    categories = cats.body.data;
    form.category_id.append(el('option', { text: 'Select a category', attrs: { value: '' } }));
    for (const c of categories) {
      form.category_id.append(el('option', { text: `${c.name} — ${c.points_per_kg} points/kg`, attrs: { value: c.category_id } }));
    }
  } else {
    form.category_id.append(el('option', { text: 'Could not load categories', attrs: { value: '' } }));
  }

  clear(form.zone_id);
  if (zones.ok) {
    form.zone_id.append(el('option', { text: 'Select a zone', attrs: { value: '' } }));
    for (const z of zones.body.data) {
      form.zone_id.append(el('option', { text: z.name, attrs: { value: z.zone_id, selected: z.zone_id === user.zone_id } }));
    }
  } else {
    form.zone_id.append(el('option', { text: 'Could not load zones', attrs: { value: '' } }));
  }

  if (!cats.ok || !zones.ok) showFormAlert(form, 'Some choices could not be loaded. Refresh the page to try again.');
}

function fillDefaults() {
  form.pickup_address.value = user.address || '';
  form.contact_phone.value = user.phone || '';
  form.preferred_at.min = bdNow();
}

// ---------- Waste photo (PRD v1.4.0, FR-03) ----------

// Read a file as a data URL (the CSP allows data: images, not blob: ones)
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

// Phone photos are often 3-8 MB: draw them on a canvas at most 1280 px wide and
// save as JPEG, which is usually 150-400 KB (the server accepts up to 2 MB).
async function shrinkPhoto(file) {
  const img = new Image();
  img.src = await readAsDataUrl(file);
  await img.decode();
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

function showPhoto(dataUrl) {
  photoData = dataUrl;
  const has = Boolean(dataUrl);
  $('#photo-preview').classList.toggle('hidden', !has);
  $('#photo-empty').classList.toggle('hidden', has);
  $('#photo-meta').classList.toggle('hidden', !has);
  if (has) {
    $('#photo-preview').src = dataUrl;
    const kb = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4 / 1024);
    $('#photo-info').textContent = `Photo ready · ${kb} KB`;
  } else {
    $('#photo-preview').removeAttribute('src');
    form.photo.value = '';
  }
}

form.photo.addEventListener('change', async () => {
  const file = form.photo.files[0];
  const box = form.photo.closest('.field').querySelector('.field-error');
  box.textContent = '';
  form.photo.classList.remove('invalid');
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    showPhoto(null);
    box.textContent = 'Choose a JPG, PNG or WebP photo.';
    return;
  }
  $('#photo-info').textContent = 'Preparing photo…';
  try {
    showPhoto(await shrinkPhoto(file));
  } catch {
    showPhoto(null);
    box.textContent = 'This photo could not be read. Try another one.';
  }
});
$('#photo-change').addEventListener('click', () => form.photo.click());

function readForm() {
  return {
    category_id: Number(form.category_id.value) || '',
    zone_id: Number(form.zone_id.value) || '',
    estimated_weight_kg: form.estimated_weight_kg.value === '' ? '' : Number(form.estimated_weight_kg.value),
    preferred_at: form.preferred_at.value,
    pickup_address: form.pickup_address.value.trim(),
    contact_phone: form.contact_phone.value.trim(),
    other_description: form.other_description.value.trim()
  };
}

function localChecks(v) {
  const errors = [];
  const c = selectedCategory();
  if (!c) errors.push({ field: 'category_id', message: 'Select a waste category.' });
  if (c && c.is_other && v.other_description.length < 5) {
    errors.push({ field: 'other_description', message: "Describe the waste (at least 5 characters)." });
  }
  if (!(v.estimated_weight_kg > 0)) errors.push({ field: 'estimated_weight_kg', message: 'Estimated weight must be greater than 0 kg.' });
  if (!v.preferred_at) errors.push({ field: 'preferred_at', message: 'Choose the preferred date and time.' });
  else if (v.preferred_at <= bdNow()) errors.push({ field: 'preferred_at', message: 'Preferred date must be in the future.' });
  if (!v.zone_id) errors.push({ field: 'zone_id', message: 'Select a zone.' });
  if (!v.pickup_address) errors.push({ field: 'pickup_address', message: 'Enter the pickup address.' });
  if (!PHONE.test(v.contact_phone)) errors.push({ field: 'contact_phone', message: 'Enter a valid Bangladeshi mobile number (e.g. 01711000000).' });
  if (!photoData) errors.push({ field: 'photo', message: 'Add a photo of the waste.' });
  return errors;
}

function showSuccess(data, values) {
  const c = selectedCategory();
  $('#success-text').textContent =
    `Request #${data.request_id} (${c ? c.name : 'waste'}, about ${values.estimated_weight_kg} kg) is now Pending. ` +
    `We will assign a collector for ${formatDateTime(values.preferred_at.replace('T', ' '))}.`;
  $('#view-request').href = `/user/requests.html?id=${data.request_id}`;
  $('#form-card').classList.add('hidden');
  $('#success-card').classList.remove('hidden');
  $('#success-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.category_id.addEventListener('change', () => { updateOtherField(); updateEstimate(); });
form.estimated_weight_kg.addEventListener('input', updateEstimate);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);
  const values = readForm();
  const errors = localChecks(values);
  if (errors.length) return showFieldErrors(form, errors);

  const body = { ...values, photo: photoData };
  if (!body.other_description) delete body.other_description;

  setLoading(button, true, 'Submitting…');
  const r = await api('/pickup-requests', { method: 'POST', body });
  setLoading(button, false);

  if (r.ok) {
    toast('Pickup request submitted.', 'success');
    return showSuccess(r.body.data, values);
  }
  showApiError(form, r);
});

$('#another').addEventListener('click', () => {
  form.reset();
  showPhoto(null);
  fillDefaults();
  form.zone_id.value = user.zone_id || '';
  updateOtherField();
  updateEstimate();
  $('#success-card').classList.add('hidden');
  $('#form-card').classList.remove('hidden');
  form.category_id.focus();
});

fillDefaults();
await loadOptions();
form.category_id.focus();
