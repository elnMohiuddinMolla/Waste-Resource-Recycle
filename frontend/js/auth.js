// ==============================================================================
// WRR frontend - Login check, header and navigation
// The page guard is only for convenience: the server checks every request itself.
// ==============================================================================

import { api } from './api.js';
import { el, clear, $ } from './ui.js';
import { startBadge } from './notifications.js';
import { icon } from './icons.js';

export const DASHBOARDS = {
  user: '/user/dashboard.html',
  collector: '/collector/dashboard.html',
  admin: '/admin/dashboard.html'
};

const NAV = {
  user: [
    ['Dashboard', '/user/dashboard.html'],
    ['New Request', '/user/new-request.html'],
    ['My Requests', '/user/requests.html'],
    ['Points', '/user/history.html'],
    ['Redeem', '/user/redeem.html'],
    ['Notifications', '/user/notifications.html', 'badge']
  ],
  collector: [
    ['Dashboard', '/collector/dashboard.html'],
    ['My Jobs', '/collector/requests.html'],
    ['History', '/collector/records.html'],
    // Collectors read notifications on their dashboard; the link jumps to that section
    ['Notifications', '/collector/dashboard.html#notifications', 'badge']
  ],
  admin: [
    ['Dashboard', '/admin/dashboard.html'],
    ['Requests', '/admin/requests.html'],
    ['Redemptions', '/admin/redemptions.html'],
    ['Users', '/admin/users.html'],
    ['Collectors', '/admin/collectors.html'],
    ['Zones', '/admin/zones.html'],
    ['Categories', '/admin/categories.html'],
    ['Rules', '/admin/rules.html'],
    ['Records', '/admin/records.html'],
    ['Reports', '/admin/reports.html']
  ]
};

// An icon for every menu link (sidebar on wide screens, "Menu" list on phones)
const MENU_ICONS = {
  Dashboard: 'home', 'New Request': 'plus', 'My Requests': 'list', Points: 'star', Redeem: 'cash', Notifications: 'bell',
  'My Jobs': 'truck', History: 'history',
  Requests: 'list', Redemptions: 'cash', Users: 'users', Collectors: 'truck',
  Zones: 'map', Categories: 'tag', Rules: 'sliders', Records: 'clipboard', Reports: 'chart'
};

// The logged-in user, or null (never redirects)
export async function currentUser() {
  const r = await api('/auth/me');
  return r.ok ? r.body.data : null;
}

/**
 * Call first on every portal page. Returns the user when they may see the page;
 * otherwise sends them to the login page or to their own dashboard.
 */
export async function requireRole(...roles) {
  const r = await api('/auth/me');
  const user = r.ok ? r.body.data : null;
  if (!user) {
    // 403 here means the account was deactivated: tell them why on the login page
    const reason = r.status === 403 ? '&reason=inactive' : '';
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}${reason}`;
    return new Promise(() => {}); // stop the page here while the browser navigates
  }
  if (!roles.includes(user.role)) {
    location.href = DASHBOARDS[user.role] || '/';
    return new Promise(() => {});
  }
  return user;
}

// Login and register pages: someone already logged in goes to their dashboard
export async function redirectIfLoggedIn() {
  const user = await currentUser();
  if (user) location.href = DASHBOARDS[user.role] || '/';
}

// Only accept a same-site path for ?next= (never an outside site).
// Let the browser's own URL parser decide: tricks such as '//evil.com' or '/\evil.com'
// resolve to another origin and are refused.
export function safeNext(next, origin = location.origin) {
  if (!next || !next.startsWith('/')) return null;
  const url = new URL(next, origin);
  return url.origin === origin ? url.pathname + url.search + url.hash : null;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}

/**
 * Fills <header id="app-header"> with the brand, role menu, user name and logout.
 * The menu folds behind a button on phones.
 */
export function renderHeader(user) {
  const header = $('#app-header');
  if (!header) return;
  header.className = 'site-header';
  clear(header);
  // All three portals: on wide screens the menu is a left sidebar (css: .has-sidebar)
  document.body.classList.add('has-sidebar');

  let badge = null;
  const links = (NAV[user.role] || []).map(([label, href, hasBadge]) => {
    const a = el('a', { text: label, attrs: { href } });
    a.prepend(icon(MENU_ICONS[label]));
    if (location.pathname === href) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    }
    if (hasBadge) {
      badge = el('span', { className: 'badge-count hidden', attrs: { 'aria-label': 'unread notifications' } });
      a.append(badge);
    }
    return a;
  });

  const nav = el('nav', { className: 'site-nav', attrs: { id: 'site-nav', 'aria-label': 'Main' } }, [
    ...links,
    el('div', { className: 'header-user' }, [
      el('div', {}, [
        el('div', { text: user.full_name, className: 'who' }),
        el('div', { text: user.role, className: 'role' })
      ]),
      el('button', { text: 'Logout', className: 'btn btn-light btn-small', attrs: { type: 'button' }, on: { click: logout } })
    ])
  ]);

  const toggle = el('button', {
    text: 'Menu',
    className: 'nav-toggle',
    attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'site-nav' },
    on: {
      click: () => {
        const open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      }
    }
  });

  header.append(el('div', { className: 'container' }, [
    el('a', { className: 'brand', attrs: { href: DASHBOARDS[user.role] } }, [
      el('span', { text: '♻', className: 'brand-mark', attrs: { 'aria-hidden': 'true' } }),
      'WRR'
    ]),
    toggle,
    nav
  ]));

  // Admins get no notification rows (FR-14), so only users and collectors poll
  if (badge && user.role !== 'admin') startBadge(badge);
}
