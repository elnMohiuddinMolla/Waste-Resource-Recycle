// ==============================================================================
// Waste Resource Recycle (WRR) - Database Configuration & Connection Pool
// ==============================================================================

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wrr_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+06:00', // Bangladesh Standard Time
  dateStrings: true   // DATETIME values come back as 'YYYY-MM-DD HH:mm:ss' strings
});

// Every connection uses Bangladesh time, so NOW() / CURRENT_TIMESTAMP match the
// times users type in (e.g. preferred_at), whatever the database server's clock zone is.
pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+06:00'");
});

// Helper for testing connection on startup
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to database: ' + (process.env.DB_NAME || 'wrr_db'));
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection error:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection
};
