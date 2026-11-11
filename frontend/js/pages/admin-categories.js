// Admin waste categories (prompt.md C12, FR-04, FR-16, api-spec.md §8.6): add, rename,
// change the points-per-kg rate, activate or deactivate. Rate changes never alter past rewards.
import { api } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { el, $, clear, statusBadge, confirmDialog, formDialog, toast, setLoading } from '../ui.js';

const me = await requireRole('admin');
renderHeader(me);

const tbody = $('#rows');

function messageRow(text) {
  clear(tbody).append(el('tr', {}, [el('td', { text, className: 'empty', attrs: { colspan: 5 } })]));
}

const RATE_FIELD = (value) => ({
  name: 'points_per_kg', label: 'Points per kg', type: 'number', value,
  attrs: { min: 0, step: '0.01', inputmode: 'decimal', required: true },
  hint: '0 or more. Applies to waste weighed from now on.'
});

async function addCategory() {
  const r = await formDialog({
    title: 'Add category',
    fields: [
      { name: 'name', label: 'Name', attrs: { maxlength: 100, required: true }, hint: '2 to 100 characters, e.g. Aluminium Cans' },
      RATE_FIELD(''),
      { name: 'is_other', label: '"Other" type — the user must describe the waste', type: 'checkbox', value: false }
    ],
    confirmText: 'Add category',
    onSubmit: (v) => api('/admin/categories', {
      method: 'POST',
      body: { name: v.name, points_per_kg: v.points_per_kg === '' ? '' : Number(v.points_per_kg), is_other: v.is_other }
    })
  });
  if (r) { toast(`Category ${r.body.data.name} added.`, 'success'); load(); }
}

async function editCategory(c) {
  const r = await formDialog({
    title: `Edit ${c.name}`,
    intro: `Current rate: ${c.points_per_kg} points/kg.`,
    fields: [
      { name: 'name', label: 'Name', value: c.name, attrs: { maxlength: 100, required: true } },
      RATE_FIELD(c.points_per_kg)
    ],
    onSubmit: (v) => api(`/admin/categories/${c.category_id}`, {
      method: 'PUT',
      body: { name: v.name, points_per_kg: v.points_per_kg === '' ? '' : Number(v.points_per_kg) }
    })
  });
  if (r) { toast('Category updated.', 'success'); load(); }
}

async function toggle(c, button) {
  const off = c.is_active;
  const ok = await confirmDialog(off
    ? `Deactivate ${c.name}? Users can no longer choose it; pickups already in progress still finish.`
    : `Activate ${c.name}? Users can choose it again.`, {
    title: off ? 'Deactivate category' : 'Activate category', confirmText: off ? 'Deactivate' : 'Activate', danger: off
  });
  if (!ok) return;
  setLoading(button, true, 'Saving…');
  const r = await api(`/admin/categories/${c.category_id}`, { method: 'PUT', body: { is_active: !off } });
  setLoading(button, false);
  if (!r.ok) return toast(r.body.message, 'error');
  toast(`${c.name} is now ${off ? 'inactive' : 'active'}.`, 'success');
  load();
}

function renderRow(c) {
  const edit = el('button', { text: 'Edit', className: 'btn btn-secondary btn-small', attrs: { type: 'button' } });
  edit.addEventListener('click', () => editCategory(c));
  const tog = el('button', {
    text: c.is_active ? 'Deactivate' : 'Activate',
    className: `btn btn-small ${c.is_active ? 'btn-secondary' : 'btn-primary'}`,
    attrs: { type: 'button' }
  });
  tog.addEventListener('click', () => toggle(c, tog));
  return el('tr', { className: c.is_active ? '' : 'is-inactive' }, [
    el('td', { text: c.name }),
    el('td', { text: c.points_per_kg, className: 'num' }),
    el('td', { text: c.is_other ? 'Other (description required)' : 'Standard', className: 'small' }),
    el('td', {}, [statusBadge(c.is_active ? 'Active' : 'Inactive')]),
    el('td', {}, [el('div', { className: 'row' }, [edit, tog])])
  ]);
}

async function load() {
  messageRow('Loading…');
  const r = await api('/admin/categories');
  if (!r.ok) return messageRow(r.body.message);
  if (r.body.data.length === 0) return messageRow('No categories yet.');
  clear(tbody);
  r.body.data.forEach((c) => tbody.append(renderRow(c)));
}

$('#add').addEventListener('click', addCategory);
await load();
