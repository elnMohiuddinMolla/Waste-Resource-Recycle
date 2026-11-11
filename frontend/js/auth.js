// ==============================================================================
// WRR frontend - Login check, header and navigation
// The page guard is only for convenience: the server checks every request itself.
// ==============================================================================

import { api } from './api.js';
import { el, clear, $ } from './ui.js';
import { startBadge } from './notifications.js';

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
    ['Dashboard', '/collector/dashboard.html', 'badge'],
    ['My Jobs', '/collector/requests.html'],
    ['History', '/collector/records.html']
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
  const user = await currentUser();
  if (!user) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
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

// Only accept a same-site path for ?next= (never an outside site)
export function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
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

  let badge = null;
  const links = (NAV[user.role] || []).map(([label, href, hasBadge]) => {
    const a = el('a', { text: label, attrs: { href } });
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
