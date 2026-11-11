// Login page (api-spec.md §1.2)
import { api } from '../api.js';
import { redirectIfLoggedIn, safeNext, DASHBOARDS } from '../auth.js';
import { $, getParam, clearErrors, showFieldErrors, showFormAlert, showApiError, setLoading } from '../ui.js';

await redirectIfLoggedIn();

const form = $('#login-form');
const button = form.querySelector('button[type="submit"]');

// Coming back from registration: say so and fill in the email
if (getParam('registered')) showFormAlert(form, 'Account created. Please log in.', 'success');
if (getParam('email')) form.email.value = getParam('email');
(form.email.value ? form.password : form.email).focus();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(form);

  const email = form.email.value.trim();
  const password = form.password.value;
  const missing = [];
  if (!email) missing.push({ field: 'email', message: 'Enter your email.' });
  if (!password) missing.push({ field: 'password', message: 'Enter your password.' });
  if (missing.length) return showFieldErrors(form, missing);

  setLoading(button, true, 'Logging in…');
  const r = await api('/auth/login', { method: 'POST', body: { email, password } });
  setLoading(button, false);

  if (r.ok) {
    const user = r.body.data.user;
    location.href = safeNext(getParam('next')) || DASHBOARDS[user.role] || '/';
    return;
  }

  // 401 wrong email/password, 403 deactivated, 429 too many attempts: show the server's message
  showApiError(form, r);
  if (r.status === 401) {
    form.password.value = '';
    form.password.focus();
  }
});
