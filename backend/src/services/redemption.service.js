// ==============================================================================
// Waste Resource Recycle (WRR) - Cash Redemption Service
// FR-15 submit, FR-21 admin processing. Contract: api-spec.md Module 6, §8.3–§8.4.
// SQL pattern: database.md §7, Transactions 2 and 3.
// ==============================================================================

const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const { toCents } = require('../utils/money');
const ledgerModel = require('../models/ledger.model');
const ruleModel = require('../models/rule.model');
const redemptionModel = require('../models/redemption.model');
const userModel = require('../models/user.model');
const { nextStatus } = require('./redemptionStateMachine');
const { createNotification, NOTIFICATION_TYPES } = require('./notification.service');

async function getActiveRule() {
  const rule = await ruleModel.findActive();
  if (!rule) throw new AppError(404, 'No active redemption rule is set.');
  return rule;
}

/**
 * FR-15 in one transaction:
 * 1. lock the user's row (a second redemption by the same user waits here),
 * 2. compute the balance and check min_points <= points <= balance,
 * 3. insert the Pending redemption and a negative REDEEM row that holds the points.
 */
async function submitRedemption(user, { points, payoutMethod, payoutAccount }) {
  return withTransaction(async (conn) => {
    await userModel.lockById(conn, user.user_id);

    const rule = await ruleModel.findActive(conn);
    if (!rule) {
      throw new AppError(422, 'Cash redemption is not available right now (no active rule).');
    }

    const balance = await ledgerModel.getBalance(user.user_id, conn);
    if (toCents(points) < toCents(rule.min_points)) {
      throw new AppError(422, `You must redeem at least ${rule.min_points} points.`);
    }
    if (toCents(points) > toCents(balance)) {
      throw new AppError(422, `Insufficient points balance. Available: ${balance}, Requested: ${points.toFixed(2)}.`);
    }

    const redemptionId = await redemptionModel.insert(conn, {
      userId: user.user_id,
      ruleId: rule.rule_id,
      points,
      payoutMethod,
      payoutAccount
    });
    await ledgerModel.insertRedemptionRow(conn, {
      userId: user.user_id,
      redemptionId,
      txnType: 'REDEEM',
      points: -points
    });

    const r = await redemptionModel.findById(conn, redemptionId);
    await createNotification({
      connection: conn,
      userId: user.user_id,
      redemptionId,
      type: NOTIFICATION_TYPES.REDEMPTION_REQUESTED,
      message: `Cash redemption #${redemptionId} of ${r.cash_amount} BDT via ${payoutMethod} submitted for review.`
    });

    return {
      redemption_id: redemptionId,
      points_redeemed: r.points_redeemed,
      cash_amount: r.cash_amount,
      status: r.status,
      payout_method: r.payout_method
    };
  });
}

async function listMine(user, status) {
  return redemptionModel.listByUser(user.user_id, status);
}

async function listForAdmin({ status, page, limit }) {
  const { total, rows } = await redemptionModel.listForAdmin({ status, limit, offset: (page - 1) * limit });
  return { total, page, limit, redemptions: rows };
}

/**
 * FR-21: approve | paid | reject, each in one transaction.
 * Reject also posts a REFUND row that gives the held points back.
 */
async function processRedemption(admin, redemptionId, { action, adminNote, payoutTrxId }) {
  return withTransaction(async (conn) => {
    const r = await redemptionModel.findByIdForUpdate(conn, redemptionId);
    if (!r) throw new AppError(404, `Redemption #${redemptionId} not found.`);

    const status = nextStatus(action, r.status); // 409 if not allowed

    await redemptionModel.updateDecision(conn, redemptionId, {
      status,
      adminId: admin.user_id,
      adminNote: adminNote || null,
      payoutTrxId: action === 'paid' ? payoutTrxId : null
    });

    let type;
    let message;
    if (action === 'approve') {
      type = NOTIFICATION_TYPES.REDEMPTION_APPROVED;
      message = `Your redemption #${redemptionId} of ${r.cash_amount} BDT was approved. Payment to your ${r.payout_method} account is on the way.`;
    } else if (action === 'paid') {
      type = NOTIFICATION_TYPES.REDEMPTION_PAID;
      message = `Your redemption of ${r.cash_amount} BDT via ${r.payout_method} has been paid! TrxID: ${payoutTrxId}`;
    } else {
      await ledgerModel.insertRedemptionRow(conn, {
        userId: r.user_id,
        redemptionId,
        txnType: 'REFUND',
        points: r.points_redeemed
      });
      type = NOTIFICATION_TYPES.REDEMPTION_REJECTED;
      message = `Redemption #${redemptionId} was rejected: ${adminNote} ${r.points_redeemed} points were refunded.`;
    }

    await createNotification({ connection: conn, userId: r.user_id, redemptionId, type, message });

    const updated = await redemptionModel.findById(conn, redemptionId);
    return {
      redemption_id: redemptionId,
      status: updated.status,
      payout_trx_id: updated.payout_trx_id
    };
  });
}

module.exports = {
  getActiveRule,
  submitRedemption,
  listMine,
  listForAdmin,
  processRedemption
};
