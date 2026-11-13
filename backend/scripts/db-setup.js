// ==============================================================================
// Waste Resource Recycle (WRR) - One-time database setup for a new server
// Runs database/schema.sql and database/seed.sql against the DB_* settings,
// e.g. a Railway MySQL (see docs/deploy-railway.md). Uses mysql2, so it also
// works with MySQL 8+ logins that XAMPP's older mysql client cannot open.
//
//   npm run db:setup                    first time only
//   ADMIN_PASSWORD=... npm run db:setup also gives admin@wrr.com that password
//
// schema.sql starts with DROP TABLE, so the script stops if the database already
// has tables. Pass --force only if you really want to wipe it and start again.
// ==============================================================================

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..', '..');
const DB_NAME = process.env.DB_NAME || 'wrr_db';
const force = process.argv.includes('--force');

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword !== undefined && adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    const [[{ tables }]] = await conn.query(
      'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = ?',
      [DB_NAME]
    );
    if (Number(tables) > 0 && !force) {
      throw new Error('Database "' + DB_NAME + '" already has ' + tables + ' tables. Nothing changed. ' +
        'Use --force only if you want to DELETE all its data and start again.');
    }

    for (const file of ['schema.sql', 'seed.sql']) {
      const sql = fs.readFileSync(path.join(ROOT, 'database', file), 'utf8')
        .replace(/\bwrr_db\b/g, DB_NAME);
      await conn.query(sql);
      console.log('Ran database/' + file + ' on "' + DB_NAME + '".');
    }

    if (adminPassword !== undefined) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await conn.query('UPDATE ' + mysql.escapeId(DB_NAME) + ".users SET password_hash = ? WHERE email = 'admin@wrr.com'", [hash]);
      console.log('Set a new password for admin@wrr.com.');
    } else {
      console.log('Note: admin@wrr.com still has the seed password. Set ADMIN_PASSWORD to change it.');
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Database setup failed:', err.message);
  process.exit(1);
});
