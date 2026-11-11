// ==============================================================================
// Waste Resource Recycle (WRR) - Rewards Controller (api-spec.md Module 5)
// ==============================================================================

const rewardService = require('../services/reward.service');
const { parsePaging } = require('./common');

async function balance(req, res, next) {
  try {
    res.json({ success: true, data: await rewardService.getBalance(req.user) });
  } catch (err) {
    next(err);
  }
}

async function history(req, res, next) {
  try {
    const { page, limit } = parsePaging(req.query, 15);
    res.json({ success: true, data: await rewardService.getHistory(req.user, { page, limit }) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  balance,
  history
};
