// Landing page: live numbers and rates from the public API (GET /categories, GET /zones),
// a points calculator, and a "Go to my dashboard" button for someone already logged in.
import { api } from '../api.js';
import { currentUser, DASHBOARDS } from '../auth.js';
import { el, clear, $, formatPoints } from '../ui.js';

// A picture for each category, chosen by a word in its name
const ICONS = [[/plastic/i, '🧴'], [/paper|card/i, '📦'], [/e-?waste|electr/i, '🔌'], [/metal|tin|can/i, '🥫'], [/glass/i, '🍾']];
const iconFor = (name) => (ICONS.find(([re]) => re.test(name)) || [null, '♻️'])[1];
const shortNumber = (n) => String(Number(n)).replace(/\.0+$/, '');

const calc = $('#calc');
let categories = [];

// ---------- Logged-in visitors go straight to their dashboard ----------

const user = await currentUser();
if (user) {
  const home = DASHBOARDS[user.role];
  clear($('#landing-actions')).append(el('a', { text: 'Go to my dashboard', className: 'btn btn-accent btn-small', attrs: { href: home } }));
  clear($('#hero-actions')).append(el('a', { text: `Continue as ${user.full_name}`, className: 'btn btn-accent btn-lg', attrs: { href: home } }));
  clear($('#band-actions')).append(el('a', { text: 'Open my dashboard', className: 'btn btn-accent btn-lg', attrs: { href: home } }));
  $('#calc-cta').href = user.role === 'user' ? '/user/new-request.html' : home;
}

// ---------- Calculator ----------

function updateEstimate() {
  const cat = categories.find((c) => String(c.category_id) === calc.category.value);
  const kg = Number(calc.kg.value);
  const points = cat && kg > 0 ? Math.round(kg * Number(cat.points_per_kg) * 100) / 100 : 0;
  $('#calc-points').textContent = formatPoints(points).replace(/\.00$/, '');
  document.querySelectorAll('.lp-rate').forEach((card) => card.classList.toggle('selected', card.dataset.id === calc.category.value));
}

function selectCategory(id) {
  calc.category.value = String(id);
  updateEstimate();
}

// ---------- Live data ----------

function renderRates() {
  const list = clear($('#rates-list'));
  for (const c of categories) {
    list.append(el('li', {
      className: 'lp-rate',
      attrs: { 'data-id': c.category_id, tabindex: '0', role: 'button', 'aria-label': `${c.name}: ${shortNumber(c.points_per_kg)} points per kg` },
      on: {
        click: () => selectCategory(c.category_id),
        keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCategory(c.category_id); } }
      }
    }, [
      el('span', { className: 'lp-rate-icon', text: iconFor(c.name) }),
      el('span', { className: 'lp-rate-name', text: c.name }),
      el('span', { className: 'lp-rate-value' }, [shortNumber(c.points_per_kg) + ' ', el('small', { text: 'pts/kg' })])
    ]));
  }
  clear(calc.category).append(...categories.map((c) => el('option', { text: `${c.name} — ${shortNumber(c.points_per_kg)} pts/kg`, attrs: { value: c.category_id } })));
}

calc.addEventListener('input', updateEstimate);
calc.addEventListener('submit', (e) => e.preventDefault());

const [cats, zones] = await Promise.all([api('/categories'), api('/zones')]);
if (cats.ok && cats.body.data.length) {
  categories = cats.body.data;
  $('#stat-categories').textContent = String(categories.length);
  $('#stat-top').textContent = shortNumber(Math.max(...categories.map((c) => Number(c.points_per_kg))));
  renderRates();
  // Start the calculator on the most common household waste (plastic), else the first one
  selectCategory((categories.find((c) => /plastic/i.test(c.name)) || categories[0]).category_id);
}
if (zones.ok) $('#stat-zones').textContent = String(zones.body.data.length);
