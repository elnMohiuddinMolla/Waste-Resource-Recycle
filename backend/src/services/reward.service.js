// ==============================================================================
// Waste Resource Recycle (WRR) - Rewards Service (balance + ledger history)
// FR-11, FR-12. Contract: api-spec.md Module 5.
// ==============================================================================

const ledgerModel = require('../models/ledger.model');
const ruleModel = require('../models/rule.model');
const { toCents, centsToString } = require('../utils/money');

async function getBalance(user) {
  const balance = await ledgerModel.getBalance(user.user_id);
  const rule = await ruleModel.findActive();

  // Show the cash value at today's rate (null if no rule is active)
  const bdt = rule
    ? centsToString(Math.round((toCents(balance) * Number(rule.taka_per_point))))
    : null;

  return {
    user_id: user.user_id,
    available_balance: balance,
    currency_equivalent_bdt: bdt
  };
}

// A short human-readable description of each ledger row
function describe(row) {
  switch (row.txn_type) {
    case 'EARN':
      return `Pickup Job #${row.request_id} (${row.actual_weight_kg} kg ${row.category_name})`;
    case 'ADJUST':
      return `Weight correction, Pickup Job #${row.request_id}`;
    case 'REDEEM':
      return `Cash Redemption #${row.redemption_id} (${row.payout_method})`;
    case 'REFUND':
      return `Refund, Cash Redemption #${row.redemption_id} rejected`;
    default:
      return row.txn_type;
  }
}

async function getHistory(user, { page, limit }) {
  const { total, rows } = await ledgerModel.listByUser(user.user_id, {
    limit,
    offset: (page - 1) * limit
  });
  return {
    total,
    page,
    limit,
    transactions: rows.map((r) => ({
      transaction_id: r.transaction_id,
      txn_type: r.txn_type,
      points: r.points,
      reference: describe(r),
      created_at: r.created_at
    }))
  };
}

module.exports = {
  getBalance,
  getHistory
};
