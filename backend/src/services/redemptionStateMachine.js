// ==============================================================================
// Waste Resource Recycle (WRR) - Cash Redemption State Machine (PRD §5.4)
//   approve: Pending  -> Approved
//   paid:    Approved -> Paid      (payout_trx_id required)
//   reject:  Pending or Approved -> Rejected (admin_note required, points refunded)
// Paid and Rejected are final. Anything else is HTTP 409.
// ==============================================================================

const AppError = require('../utils/AppError');

const REDEMPTION_STATUSES = Object.freeze(['Pending', 'Approved', 'Rejected', 'Paid']);
const PAYOUT_METHODS = Object.freeze(['bKash', 'Nagad', 'Bank']);

const ACTIONS = Object.freeze({
  approve: { from: ['Pending'], to: 'Approved' },
  paid: { from: ['Approved'], to: 'Paid' },
  reject: { from: ['Pending', 'Approved'], to: 'Rejected' }
});

// Returns the new status, or throws 409 if the action is not allowed from `currentStatus`
function nextStatus(action, currentStatus) {
  const rule = ACTIONS[action];
  if (!rule || !rule.from.includes(currentStatus)) {
    throw new AppError(409, `Cannot ${action} a redemption that is ${currentStatus}.`);
  }
  return rule.to;
}

module.exports = {
  REDEMPTION_STATUSES,
  PAYOUT_METHODS,
  ACTIONS,
  nextStatus
};
