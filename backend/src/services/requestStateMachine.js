// ==============================================================================
// Waste Resource Recycle (WRR) - Pickup Request State Machine
// The only allowed transitions (PRD §5.1, T1–T8). Everything else is HTTP 409.
// ==============================================================================

const AppError = require('../utils/AppError');

const STATUSES = Object.freeze([
  'Pending', 'Assigned', 'Accepted', 'Rejected', 'Collected', 'Completed', 'Cancelled'
]);

// id: [from, to, role allowed to make the change]
const TRANSITIONS = Object.freeze([
  { id: 'T1', from: 'Pending',   to: 'Assigned',  role: 'admin' },     // assign
  { id: 'T2', from: 'Rejected',  to: 'Assigned',  role: 'admin' },     // reassign
  { id: 'T3', from: 'Pending',   to: 'Cancelled', role: 'user' },      // user cancels
  { id: 'T4', from: 'Assigned',  to: 'Accepted',  role: 'collector' }, // accept
  { id: 'T5', from: 'Assigned',  to: 'Rejected',  role: 'collector' }, // reject (reason required)
  { id: 'T6', from: 'Accepted',  to: 'Collected', role: 'collector' }, // record weight
  { id: 'T7', from: 'Accepted',  to: 'Cancelled', role: 'collector' }, // on-site abort (reason required)
  { id: 'T8', from: 'Collected', to: 'Completed', role: 'collector' }  // complete + EARN
]);

function findTransition(from, to, role) {
  return TRANSITIONS.find((t) => t.from === from && t.to === to && t.role === role) || null;
}

function canTransition(from, to, role) {
  return findTransition(from, to, role) !== null;
}

// Throws HTTP 409 when the change is not in the table above
function assertTransition(from, to, role) {
  if (!canTransition(from, to, role)) {
    throw new AppError(409, `Invalid state transition from '${from}' to '${to}'.`);
  }
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition
};
