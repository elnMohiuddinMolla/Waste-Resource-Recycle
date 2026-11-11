// User dashboard (C3 adds the stat cards and latest requests)
import { startDashboard } from './dashboard-shell.js';

await startDashboard('user', [
  ['New pickup request', 'Ask a collector to pick up your recyclables.', '/user/new-request.html'],
  ['My requests', 'Track each request and its timeline.', '/user/requests.html'],
  ['Points', 'See every point you earned and spent.', '/user/history.html'],
  ['Redeem', 'Turn your points into cash.', '/user/redeem.html'],
  ['Notifications', 'Updates about your pickups and payouts.', '/user/notifications.html']
]);
