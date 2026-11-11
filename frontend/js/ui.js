// ==============================================================================
// WRR frontend - UI helpers
// Safety rule (NFR-03): text from users or the server is only ever put on the page
// with textContent, never innerHTML, so it can never run as code.
// ==============================================================================

/**
 * Creates an element.
 *   el('a', { text: 'Home', className: 'btn', attrs: { href: '/' }, on: { click: fn } }, [children])
 * Children may be nodes or strings (strings become text nodes).
 */
export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.text !== undefined && opts.text !== null) node.textContent = String(opts.text);
  if (opts.className) node.className = opts.className;
  for (const [name, value] of Object.entries(opts.attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [event, handler] of Object.entries(opts.on || {})) node.addEventListener(event, handler);
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

// Removes every child of a node
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

// ---------- Formatting ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The server sends Bangladesh time as 'YYYY-MM-DD HH:mm:ss'. We only re-arrange the
 * parts (no time-zone conversion), so the shown time is always Bangladesh time.
 *   '2026-11-10 14:05:00' -> '10 Nov 2026, 02:05 pm'
 */
export function formatDateTime(value) {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(value);
  const hour = Number(m[4]);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${String(h12).padStart(2, '0')}:${m[5]} ${hour < 12 ? 'am' : 'pm'}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(value);
}

export function formatPoints(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatTaka(value) {
  if (value === null || value === undefined) return '—';
  return `৳ ${formatPoints(value)}`;
}

// Coloured pill for any request or redemption status
export function statusBadge(status) {
  return el('span', { text: status, className: `status status-${String(status).toLowerCase()}` });
}

// ---------- Forms ----------

// Shows the server's errors[] next to the matching inputs; others go to the form alert
export function showFieldErrors(form, errors = [], fallbackMessage = '') {
  clearErrors(form);
  const leftover = [];
  for (const { field, message } of errors) {
    const input = form.querySelector(`[name="${CSS.escape(field)}"]`);
    if (!input) { leftover.push(message); continue; }
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    const box = input.closest('.field');
    let holder = box && box.querySelector('.field-error');
    if (box && !holder) {
      holder = el('div', { className: 'field-error' });
      box.append(holder);
    }
    if (holder) holder.textContent = message;
  }
  const text = leftover.join(' ') || (errors.length === 0 ? fallbackMessage : '');
  if (text) showFormAlert(form, text);
  const first = form.querySelector('.invalid');
  if (first) first.focus();
}

export function clearErrors(form) {
  form.querySelectorAll('.invalid').forEach((n) => { n.classList.remove('invalid'); n.removeAttribute('aria-invalid'); });
  form.querySelectorAll('.field-error').forEach((n) => { n.textContent = ''; });
  const alert = form.querySelector('.form-alert');
  if (alert) alert.textContent = '';
}

// A form's top message box (an element with class "form-alert")
export function showFormAlert(form, message, type = 'error') {
  let box = form.querySelector('.form-alert');
  if (!box) {
    box = el('div', { className: 'form-alert alert', attrs: { role: 'alert' } });
    form.prepend(box);
  }
  box.className = `form-alert alert alert-${type}`;
  box.textContent = message;
}

// Shows the response of a failed call on a form: field errors, or the message
export function showApiError(form, response) {
  const b = response.body || {};
  if (Array.isArray(b.errors) && b.errors.length > 0) showFieldErrors(form, b.errors, b.message);
  else { clearErrors(form); showFormAlert(form, b.message || 'Something went wrong. Please try again.'); }
}

// Disables a button while a request is running (prevents double submits, E-05)
export function setLoading(button, on, busyText = 'Please wait…') {
  if (!button) return;
  if (on) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.disabled = false;
  }
}

// ---------- Messages ----------

function toastArea() {
  let area = $('.toast-area');
  if (!area) {
    area = el('div', { className: 'toast-area', attrs: { 'aria-live': 'polite' } });
    document.body.append(area);
  }
  return area;
}

export function toast(message, type = 'info', ms = 4000) {
  const t = el('div', { text: message, className: `toast toast-${type}`, attrs: { role: 'status' } });
  toastArea().append(t);
  setTimeout(() => t.remove(), ms);
}

/**
 * Asks the user to confirm. Resolves true (confirmed) or false (cancelled).
 *   if (await confirmDialog('Cancel this request?', { confirmText: 'Yes, cancel', danger: true })) ...
 */
export function confirmDialog(message, { title = 'Please confirm', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = (answer) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(answer); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    const okBtn = el('button', { text: confirmText, className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, attrs: { type: 'button' }, on: { click: () => close(true) } });
    const backdrop = el('div', { className: 'modal-backdrop', on: { click: (e) => { if (e.target === backdrop) close(false); } } }, [
      el('div', { className: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
        el('h2', { text: title }),
        el('p', { text: message }),
        el('div', { className: 'modal-actions' }, [
          el('button', { text: cancelText, className: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => close(false) } }),
          okBtn
        ])
      ])
    ]);
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    okBtn.focus();
  });
}

/**
 * Asks for a written reason (reject / abort / admin notes). Resolves the trimmed text,
 * or null when cancelled. The length rule matches the server (5–200 characters).
 */
export function reasonDialog({ title, message, label = 'Reason', confirmText = 'Submit', danger = false, min = 5, max = 200, placeholder = '' }) {
  return new Promise((resolve) => {
    const close = (answer) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(answer); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const textarea = el('textarea', { attrs: { id: 'reason-input', maxlength: max, placeholder, required: true } });
    const error = el('div', { className: 'field-error' });
    const counter = el('div', { className: 'hint', text: `0 / ${max}` });
    textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length} / ${max}`; });

    const form = el('form', { className: 'form', attrs: { novalidate: true } }, [
      message ? el('p', { text: message, className: 'mb-0' }) : null,
      el('div', { className: 'field' }, [el('label', { text: label, attrs: { for: 'reason-input' } }), textarea, counter, error]),
      el('div', { className: 'modal-actions' }, [
        el('button', { text: 'Cancel', className: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        el('button', { text: confirmText, className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, attrs: { type: 'submit' } })
      ])
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = textarea.value.trim();
      if (text.length < min || text.length > max) {
        error.textContent = `Write ${min} to ${max} characters.`;
        textarea.classList.add('invalid');
        textarea.focus();
        return;
      }
      close(text);
    });

    const backdrop = el('div', { className: 'modal-backdrop', on: { click: (e) => { if (e.target === backdrop) close(null); } } }, [
      el('div', { className: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [el('h2', { text: title }), form])
    ]);
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    textarea.focus();
  });
}

/**
 * A small form in a dialog (edit a zone, a category, correct a weight...).
 *   fields: [{ name, label, type: 'text'|'number'|'textarea'|'select'|'checkbox', value, options, hint, attrs }]
 *   onSubmit(values) must return the api() response. On failure the server's errors are
 *   shown inside the dialog and it stays open; on success it closes and resolves the response.
 *   Cancelling resolves null.
 */
export function formDialog({ title, intro, fields, confirmText = 'Save', danger = false, onSubmit, onChange }) {
  return new Promise((resolve) => {
    const close = (answer) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(answer); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };

    const inputs = {};
    const fieldNodes = fields.map((f) => {
      const id = `dlg-${f.name}`;
      let input;
      if (f.type === 'textarea') {
        input = el('textarea', { attrs: { id, name: f.name, ...f.attrs } });
        input.value = f.value ?? '';
      } else if (f.type === 'select') {
        input = el('select', { attrs: { id, name: f.name, ...f.attrs } },
          f.options.map(([value, text]) => el('option', { text, attrs: { value } })));
        input.value = f.value ?? '';
      } else if (f.type === 'checkbox') {
        input = el('input', { attrs: { id, name: f.name, type: 'checkbox', ...f.attrs } });
        input.checked = Boolean(f.value);
      } else {
        input = el('input', { attrs: { id, name: f.name, type: f.type || 'text', ...f.attrs } });
        input.value = f.value ?? '';
      }
      inputs[f.name] = input;
      if (onChange) input.addEventListener('input', () => onChange(readValues(), extra));
      if (f.type === 'checkbox') {
        return el('div', { className: 'field' }, [
          el('label', { className: 'row', attrs: { for: id } }, [input, f.label]),
          f.hint ? el('div', { className: 'hint', text: f.hint }) : null,
          el('div', { className: 'field-error' })
        ]);
      }
      return el('div', { className: 'field' }, [
        el('label', { text: f.label, attrs: { for: id } }),
        input,
        f.hint ? el('div', { className: 'hint', text: f.hint }) : null,
        el('div', { className: 'field-error' })
      ]);
    });

    function readValues() {
      const v = {};
      for (const f of fields) {
        const input = inputs[f.name];
        v[f.name] = f.type === 'checkbox' ? input.checked : input.value.trim();
      }
      return v;
    }

    const extra = el('div', { className: 'preview hidden' }); // optional live note (onChange)
    const submit = el('button', { text: confirmText, className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, attrs: { type: 'submit' } });
    const form = el('form', { className: 'form', attrs: { novalidate: true } }, [
      el('div', { className: 'form-alert alert', attrs: { role: 'alert' } }),
      intro ? el('p', { text: intro, className: 'mb-0' }) : null,
      ...fieldNodes,
      extra,
      el('div', { className: 'modal-actions' }, [
        el('button', { text: 'Cancel', className: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => close(null) } }),
        submit
      ])
    ]);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      setLoading(submit, true, 'Saving…');
      const response = await onSubmit(readValues());
      setLoading(submit, false);
      if (response && response.ok) return close(response);
      if (response) showApiError(form, response);
    });

    const backdrop = el('div', { className: 'modal-backdrop', on: { click: (e) => { if (e.target === backdrop) close(null); } } }, [
      el('div', { className: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [el('h2', { text: title }), form])
    ]);
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    if (onChange) onChange(readValues(), extra);
    const first = form.querySelector('input, select, textarea');
    if (first) first.focus();
  });
}

// Loading and empty placeholders for lists
export function loadingNode(text = 'Loading…') {
  return el('div', { text, className: 'loading' });
}

export function emptyNode(text) {
  return el('div', { text, className: 'empty' });
}
