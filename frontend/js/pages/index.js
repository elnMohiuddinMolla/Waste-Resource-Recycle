// Landing page: someone already logged in sees a "Go to my dashboard" button instead
import { currentUser, DASHBOARDS } from '../auth.js';
import { el, clear, $ } from '../ui.js';

const user = await currentUser();
if (user) {
  const go = () => el('a', { text: 'Go to my dashboard', className: 'btn btn-light btn-small', attrs: { href: DASHBOARDS[user.role] } });
  clear($('#landing-actions')).append(go());
  const hero = clear($('#hero-actions'));
  hero.append(el('a', { text: `Continue as ${user.full_name}`, className: 'btn btn-primary', attrs: { href: DASHBOARDS[user.role] } }));
}
