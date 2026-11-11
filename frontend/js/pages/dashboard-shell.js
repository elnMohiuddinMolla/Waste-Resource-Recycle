// Shared start of the three role dashboards: guard the page, draw the header,
// greet the user by time of day (Bangladesh time), show today's date and the zone,
// draw the quick-action tiles and fill the icons.
import { requireRole, renderHeader } from '../auth.js';
import { el, $ } from '../ui.js';
import { icon, fillIcons } from '../icons.js';

const TZ = 'Asia/Dhaka';

function greetingWord() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()));
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * shortcuts: [title, description, href, iconName]
 */
export async function startDashboard(role, shortcuts) {
  const user = await requireRole(role);
  renderHeader(user);

  // First name for people; the whole name for the admin account ("System Administrator")
  const name = role === 'admin' ? user.full_name : user.full_name.split(' ')[0];
  $('#greeting').textContent = `${greetingWord()}, ${name}`;
  $('#today').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date());
  const zone = $('#zone');
  if (zone) {
    if (user.zone_name) zone.append(icon('pin'), user.zone_name);
    else zone.classList.add('hidden');
  }

  const grid = $('#shortcuts');
  for (const [title, text, href, iconName] of shortcuts) {
    grid.append(el('a', { className: 'db-tile', attrs: { href } }, [
      el('span', { className: 'db-tile-icon' }, [icon(iconName)]),
      el('span', { className: 'db-tile-text' }, [
        el('strong', { text: title }),
        el('small', { text })
      ]),
      el('span', { className: 'db-tile-arrow' }, [icon('arrow')])
    ]));
  }
  fillIcons();
  return user;
}

// "in 3 h", "in 2 days", "2 h ago" for a 'YYYY-MM-DD HH:mm:ss' Bangladesh time
export function relativeTime(value) {
  const when = new Date(value.replace(' ', 'T') + '+06:00').getTime();
  const mins = Math.round((when - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const text = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`;
  return mins >= 0 ? `in ${text}` : `${text} ago`;
}
