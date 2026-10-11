// Small-project backup of the tables in this repository. Stop all writers first.
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const db = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'quanlybanhang', dateStrings: true });
  try {
    const [triggers] = await db.query('SHOW TRIGGERS');
    if (triggers.length) throw Error('Database has triggers: use mysqldump with --triggers instead.');
    const [tables] = await db.query("SELECT TABLE_NAME, ENGINE FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'");
    const allowed = ['khachhang', 'sanpham', 'donhang', 'chitietdonhang', 'schema_migrations'];
    if (tables.some(t => !allowed.includes(t.TABLE_NAME) || t.ENGINE !== 'InnoDB')) throw Error('Unexpected tables or non-InnoDB engine: use mysqldump for a full backup.');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const sql = ['-- Backup: restore ONLY into an empty, separate database for verification.', 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;'];
    for (const name of allowed.filter(n => tables.some(t => t.TABLE_NAME === n))) {
      const escaped = mysql.escapeId(name);
      const [[ddl]] = await db.query(`SHOW CREATE TABLE ${escaped}`);
      sql.push(ddl['Create Table'] + ';');
      const [rows] = await db.query(`SELECT * FROM ${escaped}`);
      for (const row of rows) sql.push(`INSERT INTO ${escaped} (${Object.keys(row).map(key => mysql.escapeId(key)).join(', ')}) VALUES (${Object.values(row).map(v => mysql.escape(v)).join(', ')});`);
    }
    sql.push('SET FOREIGN_KEY_CHECKS=1;');
    await db.commit();
    const dir = path.join(__dirname, '../backups'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `before-sprint3-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
    fs.writeFileSync(file, sql.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Backup saved:', file);
  } finally { await db.end(); }
}
main().catch(error => { console.error('Backup failed:', error.code || error.message); process.exitCode = 1; });
