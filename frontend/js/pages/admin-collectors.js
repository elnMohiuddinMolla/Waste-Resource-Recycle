// Admin collectors (prompt.md C12, FR-20, api-spec.md §8.9): create collector accounts
// and change a collector's operating zone.
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import {
  el, $, clear, statusBadge, toast, formDialog, setLoading, clearErrors, showFieldErrors, showApiError
} from '../ui.js';

const me = await requireRole('admin');
renderHeader(me);

const form = $('#create-form');
const createBtn = form.querySelector('button[type="submit"]');
const tbody = $('#rows');
const PHONE = /^(?:\+8801|01)[3-9]\d{8}$/;
let activeZones = []; // [{ zone_id, name }]

function messageRow(text) {
  clear(tbody).append(el('tr', {}, [el('td', { text, className: 'empty', attrs: { colspan: 5 } })]));
}

async function changeZone(c) {
  const r = await formDialog({
    title: `Zone for ${c.full_name}`,
    intro: c.open_jobs > 0 ? `${c.open_jobs} open job${c.open_jobs === 1 ? '' : 's'} stay with this collector.` : undefined,
    fields: [{
      name: 'zone_id', label: 'Operating zone', type: 'select', value: String(c.zone_id || ''),
      options: activeZones.map((z) => [String(z.zone_id), z.name])
    }],
    onSubmit: (v) => api(`/admin/users/${c.user_id}/zone`, { method: 'PATCH', body: { zone_id: Number(v.zone_id) } })
  });
  if (r) {
    toast(`${c.full_name} now works in ${r.body.data.zone_name}.`, 'success');
    loadCollectors();
  }
}

function renderRow(c) {
  const btn = el('button', { text: 'Change zone', className: 'btn btn-secondary btn-small', attrs: { type: 'button' } });
  btn.addEventListener('click', () => changeZone(c));
  return el('tr', { className: c.status === 'inactive' ? 'is-inactive' : '' }, [
    el('td', {}, [
      el('div', { text: c.full_name }),
      el('div', { className: 'small' }, [el('a', { text: c.phone, attrs: { href: `tel:${c.phone}` } }), ` · ${c.email}`])
    ]),
    el('td', { text: c.zone_name || '—' }),
    el('td', { text: String(c.open_jobs), className: 'num' }),
    el('td', {}, [statusBadge(c.status)]),
    el('td', {}, [btn])
  ]);
}

async function loadCollectors() {
  messageRow('Loading…');
  const r = await api('/admin/users?role=collector&limit=50');
  if (!r.ok) return messageRow(r.body.message);
  if (r.body.data.users.length === 0) return messageRow('No collectors yet. Create the first one.');
  clear(tbody);
  r.body.data.users.forEach((c) => tbody.append(renderRow(c)));
}

async function loadZones() {
  const r = await api('/zones'); // active zones only: a collector must work in an active zone
  activeZones = r.ok ? r.body.data : [];
  clear(form.zone_id).append(el('option', { text: 'Select a zone', attrs: { value: '' } }));
  activeZones.forEach((z) => form.zone_id.append(el('option', { text: z.name, attrs: { value: z.zone_id } })));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(form);
  const values = {
    full_name: form.full_name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    zone_id: Number(form.zone_id.value) || '',
    password: form.password.value,
    address: form.address.value.trim()
  };
  const errors = [];
  if (values.full_name.length < 3) errors.push({ field: 'full_name', message: 'Full name must be 3 to 100 characters.' });
  if (!values.email) errors.push({ field: 'email', message: 'Enter an email.' });
  if (!PHONE.test(values.phone)) errors.push({ field: 'phone', message: 'Enter a valid Bangladeshi mobile number.' });
  if (!values.zone_id) errors.push({ field: 'zone_id', message: 'Select the operating zone.' });
  if (values.password.length < 8) errors.push({ field: 'password', message: 'Password must be at least 8 characters.' });
  if (errors.length) return showFieldErrors(form, errors);

  setLoading(createBtn, true, 'Creating…');
  const r = await api('/admin/collectors', { method: 'POST', body: values });
  setLoading(createBtn, false);
  if (r.ok) {
    toast(`Collector ${r.body.data.full_name} created. They can log in with ${r.body.data.email}.`, 'success', 6000);
    form.reset();
    loadCollectors();
    return;
  }
  if (r.status === 409) return showFieldErrors(form, [{ field: 'email', message: r.body.message }]);
  showApiError(form, r);
});

await loadZones();
await loadCollectors();
