// ==============================================================================
// Waste Resource Recycle (WRR) - Cash Redemption Controller
// User: api-spec.md Module 6. Admin: §8.3, §8.4.
// ==============================================================================

const AppError = require('../utils/AppError');
const redemptionService = require('../services/redemption.service');
const { REDEMPTION_STATUSES, PAYOUT_METHODS, ACTIONS } = require('../services/redemptionStateMachine');
const { isValidPhone, toPositiveAmount, toPositiveInt, cleanText } = require('../utils/validators');
const { parsePaging } = require('./common');

const BANK_ACCOUNT_REGEX = /^[0-9-]{6,30}$/;
const TRX_ID_REGEX = /^[A-Za-z0-9-]{4,50}$/;

function parseStatus(value) {
  if (!value) return null;
  if (!REDEMPTION_STATUSES.includes(value)) {
    throw new AppError(400, 'Validation failed.', [
      { field: 'status', message: `Status must be one of: ${REDEMPTION_STATUSES.join(', ')}.` }
    ]);
  }
  return value;
}

function parseRedemptionId(req) {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new AppError(404, `Redemption #${req.params.id} not found.`);
  return id;
}

// ---------- User ----------

async function activeRule(req, res, next) {
  try {
    res.json({ success: true, data: await redemptionService.getActiveRule() });
  } catch (err) {
    next(err);
  }
}

async function submit(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];

    const points = toPositiveAmount(body.points_redeemed);
    const payoutMethod = cleanText(body.payout_method);
    const payoutAccount = cleanText(body.payout_account);

    if (!points) errors.push({ field: 'points_redeemed', message: 'Points to redeem must be greater than 0.' });
    if (!PAYOUT_METHODS.includes(payoutMethod)) {
      errors.push({ field: 'payout_method', message: `Payout method must be one of: ${PAYOUT_METHODS.join(', ')}.` });
    } else if (payoutMethod === 'Bank' ? !BANK_ACCOUNT_REGEX.test(payoutAccount) : !isValidPhone(payoutAccount)) {
      errors.push({
        field: 'payout_account',
        message: payoutMethod === 'Bank'
          ? 'Enter a bank account number (6 to 30 digits).'
          : `Enter the 11-digit ${payoutMethod} mobile number.`
      });
    }
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await redemptionService.submitRedemption(req.user, { points, payoutMethod, payoutAccount });
    res.status(201).json({
      success: true,
      message: 'Cash redemption request submitted for administrative review.',
      data
    });
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    const data = await redemptionService.listMine(req.user, parseStatus(req.query.status));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------

async function listForAdmin(req, res, next) {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const data = await redemptionService.listForAdmin({ status: parseStatus(req.query.status), page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function processDecision(req, res, next) {
  try {
    const id = parseRedemptionId(req);
    const body = req.body || {};
    const action = cleanText(body.action);
    const adminNote = cleanText(body.admin_note);
    const payoutTrxId = cleanText(body.payout_trx_id);
    const errors = [];

    if (!Object.keys(ACTIONS).includes(action)) {
      errors.push({ field: 'action', message: "Action must be 'approve', 'paid' or 'reject'." });
    }
    if (action === 'paid' && !TRX_ID_REGEX.test(payoutTrxId)) {
      errors.push({ field: 'payout_trx_id', message: 'Enter the bKash/Nagad/Bank transaction ID (4 to 50 letters or digits).' });
    }
    if (action === 'reject' && adminNote.length < 5) {
      errors.push({ field: 'admin_note', message: 'A reason is required to reject (at least 5 characters).' });
    }
    if (adminNote.length > 200) {
      errors.push({ field: 'admin_note', message: 'Note must be at most 200 characters.' });
    }
    if (errors.length > 0) throw new AppError(400, 'Validation failed.', errors);

    const data = await redemptionService.processRedemption(req.user, id, { action, adminNote, payoutTrxId });
    res.json({ success: true, message: 'Redemption processed successfully.', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  activeRule,
  submit,
  listMine,
  listForAdmin,
  processDecision
};
