// Shared start of the three role dashboards: guard the page, draw the header,
// greet the user and show shortcut cards. Steps C3 / C7 / C9 add live numbers.
import { requireRole, renderHeader } from '../auth.js';
import { el, $ } from '../ui.js';

export async function startDashboard(role, shortcuts) {
  const user = await requireRole(role);
  renderHeader(user);

  $('#greeting').textContent = `Welcome, ${user.full_name}`;
  if (user.zone_name) $('#zone').textContent = user.zone_name;

  const grid = $('#shortcuts');
  for (const [title, text, href] of shortcuts) {
    grid.append(el('a', { className: 'card card-link', attrs: { href } }, [
      el('h3', { text: title }),
      el('p', { text, className: 'muted small mb-0' })
    ]));
  }
  return user;
}
