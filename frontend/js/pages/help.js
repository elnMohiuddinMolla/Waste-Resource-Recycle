// Help & FAQ (PRD v1.5.0, FR-22). Public page: logged-in visitors see their usual menu,
// and the ticket buttons point to the right page for their role.
import { currentUser, renderHeader } from '../auth.js';
import { fillIcons } from '../icons.js';
import { $ } from '../ui.js';

fillIcons();

const user = await currentUser();
if (user) {
  renderHeader(user);
  const target = user.role === 'admin' ? '/admin/support.html' : '/support.html';
  const text = user.role === 'admin' ? 'Answer support tickets' : 'Open a support ticket';
  for (const id of ['#ticket-link', '#ticket-link-2']) {
    $(id).href = target;
    $(id).lastChild.textContent = text;
  }
} else {
  // Not logged in: log in first, then come back to the ticket page
  for (const id of ['#ticket-link', '#ticket-link-2']) $(id).href = '/login.html?next=%2Fsupport.html';
}
