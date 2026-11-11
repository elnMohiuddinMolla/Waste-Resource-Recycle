// Admin zones (prompt.md C12, FR-19, api-spec.md §8.7): add, rename, describe,
// activate or deactivate. Zones are never deleted.
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { el, $, clear, statusBadge, confirmDialog, formDialog, toast, setLoading } from '../ui.js';

const me = await requireRole('admin');
renderHeader(me);

const tbody = $('#rows');

function messageRow(text) {
  clear(tbody).append(el('tr', {}, [el('td', { text, className: 'empty', attrs: { colspan: 4 } })]));
}

function zoneFields(z = {}) {
  return [
    { name: 'name', label: 'Name', value: z.name, attrs: { maxlength: 100, required: true }, hint: '2 to 100 characters, e.g. Zone 5 - Ambikapur' },
    { name: 'description', label: 'Description (optional)', type: 'textarea', value: z.description, attrs: { maxlength: 1000 } }
  ];
}

async function addZone() {
  const r = await formDialog({
    title: 'Add zone',
    fields: zoneFields(),
    confirmText: 'Add zone',
    onSubmit: (v) => api('/admin/zones', { method: 'POST', body: v })
  });
  if (r) { toast(`Zone ${r.body.data.name} added.`, 'success'); load(); }
}

async function editZone(z) {
  const r = await formDialog({
    title: `Edit ${z.name}`,
    fields: zoneFields(z),
    onSubmit: (v) => api(`/admin/zones/${z.zone_id}`, { method: 'PUT', body: v })
  });
  if (r) { toast('Zone updated.', 'success'); load(); }
}

async function toggle(z, button) {
  const off = z.is_active;
  const ok = await confirmDialog(off
    ? `Deactivate ${z.name}? It disappears from registration and new requests. Existing users and requests keep it.`
    : `Activate ${z.name}? It becomes available for registration and new requests.`, {
    title: off ? 'Deactivate zone' : 'Activate zone', confirmText: off ? 'Deactivate' : 'Activate', danger: off
  });
  if (!ok) return;
  setLoading(button, true, 'Saving…');
  const r = await api(`/admin/zones/${z.zone_id}`, { method: 'PUT', body: { is_active: !off } });
  setLoading(button, false);
  if (!r.ok) return toast(r.body.message, 'error');
  toast(`${z.name} is now ${off ? 'inactive' : 'active'}.`, 'success');
  load();
}

function renderRow(z) {
  const edit = el('button', { text: 'Edit', className: 'btn btn-secondary btn-small', attrs: { type: 'button' } });
  edit.addEventListener('click', () => editZone(z));
  const tog = el('button', {
    text: z.is_active ? 'Deactivate' : 'Activate',
    className: `btn btn-small ${z.is_active ? 'btn-secondary' : 'btn-primary'}`,
    attrs: { type: 'button' }
  });
  tog.addEventListener('click', () => toggle(z, tog));
  return el('tr', { className: z.is_active ? '' : 'is-inactive' }, [
    el('td', { text: z.name }),
    el('td', { text: z.description || '—', className: 'small' }),
    el('td', {}, [statusBadge(z.is_active ? 'Active' : 'Inactive')]),
    el('td', {}, [el('div', { className: 'row' }, [edit, tog])])
  ]);
}

async function load() {
  messageRow('Loading…');
  const r = await api('/admin/zones');
  if (!r.ok) return messageRow(r.body.message);
  if (r.body.data.length === 0) return messageRow('No zones yet.');
  clear(tbody);
  r.body.data.forEach((z) => tbody.append(renderRow(z)));
}

$('#add').addEventListener('click', addZone);
await load();
