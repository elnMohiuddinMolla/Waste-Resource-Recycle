// Registration page (api-spec.md §1.1). The server checks everything again;
// the checks here only give faster feedback.
import { api } from '../api.js';
import { redirectIfLoggedIn } from '../auth.js';
import { $, el, clear, clearErrors, showFieldErrors, showFormAlert, showApiError, setLoading } from '../ui.js';

await redirectIfLoggedIn();

const form = $('#register-form');
const button = form.querySelector('button[type="submit"]');
const PHONE = /^(?:\+8801|01)[3-9]\d{8}$/;

// Fill the zone dropdown with active zones (public endpoint)
async function loadZones() {
  const select = form.zone_id;
  const r = await api('/zones');
  clear(select);
  if (!r.ok) {
    select.append(el('option', { text: 'Could not load zones', attrs: { value: '' } }));
    showFormAlert(form, 'Zones could not be loaded. Refresh the page to try again.');
    return;
  }
  select.append(el('option', { text: 'Select your zone', attrs: { value: '' } }));
  for (const z of r.body.data) select.append(el('option', { text: z.name, attrs: { value: z.zone_id } }));
}

function localChecks(values) {
  const errors = [];
  if (values.full_name.length < 3) errors.push({ field: 'full_name', message: 'Full name must be 3 to 100 characters.' });
  if (!values.email) errors.push({ field: 'email', message: 'Enter your email.' });
  if (!PHONE.test(values.phone)) errors.push({ field: 'phone', message: 'Enter a valid Bangladeshi mobile number (e.g. 01711000000).' });
  if (!values.zone_id) errors.push({ field: 'zone_id', message: 'Select your zone.' });
  if (values.password.length < 8) errors.push({ field: 'password', message: 'Password must be at least 8 characters.' });
  if (values.password !== form.confirm_password.value) {
    errors.push({ field: 'confirm_password', message: 'The two passwords do not match.' });
  }
  return errors;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);

  const values = {
    full_name: form.full_name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    zone_id: Number(form.zone_id.value) || '',
    address: form.address.value.trim(),
    password: form.password.value
  };
  const errors = localChecks(values);
  if (errors.length) return showFieldErrors(form, errors);

  setLoading(button, true, 'Creating account…');
  const r = await api('/auth/register', { method: 'POST', body: values });
  setLoading(button, false);

  if (r.ok) {
    location.href = `/login.html?registered=1&email=${encodeURIComponent(r.body.data.email)}`;
    return;
  }
  // 409 duplicate email has no errors[]: put it under the email field
  if (r.status === 409) return showFieldErrors(form, [{ field: 'email', message: r.body.message }]);
  showApiError(form, r);
});

await loadZones();
form.full_name.focus();
