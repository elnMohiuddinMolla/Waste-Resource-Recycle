// ==============================================================================
// Waste Resource Recycle (WRR) - Collection Record Service (admin)
// FR-18 weight correction. Contract: api-spec.md §8.5. SQL: database.md §7 Transaction 4.
// ==============================================================================

const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const { toCents, centsToString } = require('../utils/money');
const collectionModel = require('../models/collection.model');
const ledgerModel = require('../models/ledger.model');
const statusLogModel = require('../models/statusLog.model');

async function listRecords(filters) {
  const { total, rows } = await collectionModel.listForAdmin({
    ...filters,
    offset: (filters.page - 1) * filters.limit
  });
  return { total, page: filters.page, limit: filters.limit, records: rows };
}

/**
 * One transaction:
 * 1. lock the record + request, and the user's row (so no redemption runs in between),
 * 2. ADJUST = ROUND(new_kg × rate, 2) − points already posted for this record,
 * 3. refuse if the user's balance would go below 0 (PRD §5.3),
 * 4. update the weight, post the ADJUST row, and write the audit log.
 */
async function correctWeight(admin, recordId, { actualWeightKg, remarks }) {
  return withTransaction(async (conn) => {
    const record = await collectionModel.findForCorrection(conn, recordId);
    if (!record) throw new AppError(404, `Collection record #${recordId} not found.`);

    if (record.request_status !== 'Completed') {
      throw new AppError(409, `Only completed collections can be corrected (request #${record.request_id} is ${record.request_status}).`);
    }
    if (toCents(actualWeightKg) === toCents(record.actual_weight_kg)) {
      throw new AppError(400, 'Validation failed.', [
        { field: 'actual_weight_kg', message: `The weight is already ${record.actual_weight_kg} kg.` }
      ]);
    }

    await conn.execute('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [record.user_id]);

    const delta = await collectionModel.adjustmentFor(conn, recordId, actualWeightKg);
    const balance = await ledgerModel.getBalance(record.user_id, conn);
    if (toCents(balance) + toCents(delta) < 0) {
      throw new AppError(422, "Weight correction denied: the user's balance would drop below 0.00.");
    }

    const newWeight = centsToString(toCents(actualWeightKg));
    await collectionModel.updateWeight(conn, recordId, { actualWeightKg, remarks: remarks || null });
    if (toCents(delta) !== 0) {
      await ledgerModel.insertAdjust(conn, { userId: record.user_id, recordId, points: delta });
    }
    await statusLogModel.insert(conn, {
      requestId: record.request_id,
      changedById: admin.user_id,
      oldStatus: 'Completed',
      newStatus: 'Completed',
      note: `Weight corrected from ${record.actual_weight_kg} kg to ${newWeight} kg`
    });

    return {
      record_id: recordId,
      corrected_weight_kg: newWeight,
      point_adjustment: centsToString(toCents(delta))
    };
  });
}

module.exports = {
  listRecords,
  correctWeight
};
