// Admin dashboard (C9 adds the KPI cards)
import { startDashboard } from './dashboard-shell.js';

await startDashboard('admin', [
  ['Requests', 'Assign collectors to pending and rejected requests.', '/admin/requests.html'],
  ['Redemptions', 'Approve, pay or reject cash redemptions.', '/admin/redemptions.html'],
  ['Users', 'Activate or deactivate accounts.', '/admin/users.html'],
  ['Collectors', 'Create collector accounts and set their zones.', '/admin/collectors.html'],
  ['Zones', 'Manage operating zones.', '/admin/zones.html'],
  ['Categories', 'Waste categories and points per kg.', '/admin/categories.html'],
  ['Redemption rules', 'Taka per point and the minimum to redeem.', '/admin/rules.html'],
  ['Collection records', 'Review weights and correct mistakes.', '/admin/records.html'],
  ['Reports', 'Five management reports, printable and exportable.', '/admin/reports.html']
]);
