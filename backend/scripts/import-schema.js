'use strict';

/**
 * 将 schema.sql 导入当前 .env 配置的数据库（默认 backend）。
 * 仅建表（IF NOT EXISTS），不会删除/覆盖已有数据。
 * 运行：cd backend && node scripts/import-schema.js
 */

require('../src/config');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const { stripDatabaseSwitch } = require('./lib/schema-sql');

async function main() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${config.db.database}\``);
  // 剥离 schema 内硬编码的 CREATE DATABASE/USE，保证表落在 config.db.database
  const schema = stripDatabaseSwitch(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
  await conn.query(schema);
  // 校验表数量
  const [tables] = await conn.query('SHOW TABLES');
  console.log(`✓ 已向数据库 ${config.db.database} 导入 schema，当前表数量：${tables.length}`);
  await conn.end();
}

main().catch((e) => {
  console.error('✗ 导入失败：', e.message);
  if (e.sql) console.error('SQL:', e.sql);
  process.exit(1);
});
