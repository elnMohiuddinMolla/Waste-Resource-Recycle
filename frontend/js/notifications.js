// ==============================================================================
// WRR frontend - Unread notification badge
// Polls every 30 seconds (architecture.md §8: polling instead of WebSockets).
// ==============================================================================

import { api } from './api.js';

const POLL_MS = 30000;
const listeners = new Set();

async function refresh(badge) {
  const r = await api('/notifications?unread_only=true&limit=1');
  if (!r.ok) return;
  const n = r.body.data.unread_count;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.classList.toggle('hidden', n === 0);
  listeners.forEach((fn) => fn(n));
}

// Starts polling for one badge element in the header
export function startBadge(badge) {
  refresh(badge);
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh(badge);
  }, POLL_MS);
  // Pages (e.g. the notifications list) can ask for an immediate update
  document.addEventListener('wrr:notifications-changed', () => refresh(badge));
}

// Lets a page react when the unread count changes
export function onUnreadCount(fn) {
  listeners.add(fn);
}

// Call after marking notifications as read, so the badge updates at once
export function notificationsChanged() {
  document.dispatchEvent(new Event('wrr:notifications-changed'));
}
