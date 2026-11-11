// ==============================================================================
// Waste Resource Recycle (WRR) - Transaction Helper
// Runs `work(connection)` inside START TRANSACTION ... COMMIT.
// Any thrown error rolls everything back (NFR-04).
// ==============================================================================

const { pool } = require('../config/db');

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  withTransaction
};
