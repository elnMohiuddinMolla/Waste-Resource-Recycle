// Collector dashboard (C7 adds job counts and latest notifications)
import { startDashboard } from './dashboard-shell.js';

await startDashboard('collector', [
  ['My jobs', 'Accept, reject or work on your assigned pickups.', '/collector/requests.html'],
  ['History', 'Your completed collections and total kg.', '/collector/records.html']
]);
