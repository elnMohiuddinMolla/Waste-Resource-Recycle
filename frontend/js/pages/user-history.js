// Points page (prompt.md C6, FR-11, FR-12, api-spec.md Module 5):
// balance, completed pickups with weight × rate = points, and the signed ledger.
import { api, query } from '../api.js';
import { requireRole, renderHeader } from '../auth.js';
import { el, $, clear, formatPoints, formatTaka, formatDateTime } from '../ui.js';

const user = await requireRole('user');
renderHeader(user);

const PICKUPS_PER_PAGE = 10;
const LEDGER_PER_PAGE = 15;
let pickupsPage = 1;
let ledgerPage = 1;

const TYPE_LABEL = { EARN: 'Earned', REDEEM: 'Redeemed', REFUND: 'Refunded', ADJUST: 'Adjustment' };

function messageRow(tbody, cols, text) {
  clear(tbody).append(el('tr', {}, [el('td', { text, className: 'empty', attrs: { colspan: cols } })]));
}

function setPager(prefix, page, total, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  $(`#${prefix}-pager`).classList.toggle('hidden', pages <= 1);
  $(`#${prefix}-info`).textContent = `Page ${page} of ${pages}`;
  $(`#${prefix}-prev`).disabled = page <= 1;
  $(`#${prefix}-next`).disabled = page >= pages;
}

function signedPoints(value) {
  const n = Number(value);
  return el('span', { text: `${n > 0 ? '+' : ''}${formatPoints(n)}`, className: n < 0 ? 'amount-minus' : 'amount-plus' });
}

async function loadBalance() {
  const r = await api('/rewards/balance');
  if (!r.ok) return;
  $('#balance').textContent = formatPoints(r.body.data.available_balance);
  const bdt = r.body.data.currency_equivalent_bdt;
  $('#balance-bdt').textContent = bdt === null ? '' : `≈ ${formatTaka(bdt)} at today's rate`;
}

// The list gives the weight; the details give the rate and points, so fetch them per row
async function loadPickups() {
  const tbody = $('#pickups');
  messageRow(tbody, 6, 'Loading…');
  const r = await api(`/pickup-requests/mine${query({ status: 'Completed', page: pickupsPage, limit: PICKUPS_PER_PAGE })}`);
  if (!r.ok) return messageRow(tbody, 6, r.body.message);

  const { total, requests } = r.body.data;
  setPager('pickups', pickupsPage, total, PICKUPS_PER_PAGE);
  if (requests.length === 0) return messageRow(tbody, 6, 'No completed pickups yet.');

  const details = await Promise.all(requests.map((req) => api(`/pickup-requests/${req.request_id}`)));
  clear(tbody);
  details.forEach((d, i) => {
    const req = d.ok ? d.body.data : requests[i];
    const completed = d.ok ? (req.timeline.find((t) => t.new_status === 'Completed') || {}).changed_at : null;
    tbody.append(el('tr', {}, [
      el('td', {}, [el('a', { text: `#${req.request_id}`, attrs: { href: `/user/requests.html?id=${req.request_id}` } })]),
      el('td', { text: req.category_name }),
      el('td', { text: `${req.actual_weight_kg} kg`, className: 'num' }),
      el('td', { text: d.ok ? `${req.points_per_kg}/kg` : '—', className: 'num' }),
      el('td', { className: 'num' }, [d.ok && req.points_earned ? signedPoints(req.points_earned) : '—']),
      el('td', { text: formatDateTime(completed) })
    ]));
  });
}

async function loadLedger() {
  const tbody = $('#ledger');
  messageRow(tbody, 4, 'Loading…');
  const r = await api(`/rewards/history${query({ page: ledgerPage, limit: LEDGER_PER_PAGE })}`);
  if (!r.ok) return messageRow(tbody, 4, r.body.message);

  const { total, transactions } = r.body.data;
  setPager('ledger', ledgerPage, total, LEDGER_PER_PAGE);
  if (transactions.length === 0) return messageRow(tbody, 4, 'No points yet. Complete a pickup to earn your first points.');

  clear(tbody);
  for (const t of transactions) {
    tbody.append(el('tr', {}, [
      el('td', { text: formatDateTime(t.created_at) }),
      el('td', {}, [el('span', { text: TYPE_LABEL[t.txn_type] || t.txn_type, className: 'txn-type' })]),
      el('td', { text: t.reference }),
      el('td', { className: 'num' }, [signedPoints(t.points)])
    ]));
  }
}

$('#pickups-prev').addEventListener('click', () => { pickupsPage -= 1; loadPickups(); });
$('#pickups-next').addEventListener('click', () => { pickupsPage += 1; loadPickups(); });
$('#ledger-prev').addEventListener('click', () => { ledgerPage -= 1; loadLedger(); });
$('#ledger-next').addEventListener('click', () => { ledgerPage += 1; loadLedger(); });

await Promise.all([loadBalance(), loadPickups(), loadLedger()]);
