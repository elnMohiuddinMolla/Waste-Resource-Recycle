// ==============================================================================
// Waste Resource Recycle (WRR) - Redemption Rule Governance Service (admin)
// FR-16. Contract: api-spec.md §8.8.
// Old rules are never edited or deleted: a pending redemption keeps the rule_id and
// cash_amount it was created with (requirement-validation EC-06).
// ==============================================================================

const { withTransaction } = require('../utils/transaction');
const ruleModel = require('../models/rule.model');

async function listRules() {
  const rules = await ruleModel.listAll();
  return {
    active: rules.find((r) => r.is_active) || null,
    archived: rules.filter((r) => !r.is_active)
  };
}

// One transaction: switch off the current rule, then insert the new active one.
// The order matters: the UNIQUE index allows only one active row at any moment.
async function createRule(admin, { takaPerPoint, minPoints }) {
  return withTransaction(async (conn) => {
    await ruleModel.deactivateAll(conn);
    const ruleId = await ruleModel.insert(conn, { takaPerPoint, minPoints, updatedBy: admin.user_id });
    return ruleModel.findById(conn, ruleId);
  });
}

module.exports = {
  listRules,
  createRule
};
