require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const check = process.argv.includes('--check');
  const dbName = process.env.DB_NAME || 'quanlybanhang';
  const db = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD, database: dbName });
  const lockName = 'shopping-migrate-' + crypto.createHash('sha256').update(dbName).digest('hex').slice(0, 32);
  let locked = false;
  try {
    if (!check) {
      const [[lock]] = await db.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
      if (Number(lock.acquired) !== 1) throw new Error('Another migration is running');
      locked = true;
      await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    }
    const [[exists]] = await db.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [dbName, 'schema_migrations']);
    const [history] = exists.n ? await db.query('SELECT name, checksum FROM schema_migrations') : [[]];
    for (const name of fs.readdirSync(path.join(__dirname, '../migrations')).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
      const sql = fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const applied = history.find(row => row.name === name);
      if (applied) { if (applied.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`); console.log(`APPLIED ${name}`); continue; }
      console.log(`PENDING ${name}`);
      if (check) continue;
      for (const raw of sql.split(/^-- statement\s*$/m)) {
        const statement = raw.replace(/^--.*$/gm, '').trim();
        if (!statement) continue;
        const add = statement.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
        if (add) {
          const [[column]] = await db.query('SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?', [dbName, add[1], add[2]]);
          if (column.n) { console.log(`KEEP ${add[1]}.${add[2]}`); continue; }
        }
        await db.query(statement);
      }
      await db.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [name, checksum]);
    }
    if (!check) {
      const [duplicates] = await db.query('SELECT email, COUNT(*) AS n FROM khachhang WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1 LIMIT 1');
      if (duplicates.length) throw new Error('Duplicate emails detected; resolve manually, then rerun. No rows were changed.');
      const [indexes] = await db.query("SELECT index_name FROM information_schema.statistics WHERE table_schema = ? AND table_name = 'khachhang' AND non_unique = 0 GROUP BY index_name HAVING COUNT(*) = 1 AND MAX(column_name) = 'email'", [dbName]);
      if (!indexes.length) await db.query('ALTER TABLE khachhang ADD UNIQUE INDEX uq_khachhang_email (email)');
      console.log('Migration complete');
    }
  } finally {
    if (locked) await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
    await db.end();
  }
}
main().catch(err => { console.error('Migration failed:', err.code || err.message); process.exitCode = 1; });
