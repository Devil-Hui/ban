'use strict';

/**
 * 初始化数据库：执行 schema.sql（含 CREATE DATABASE + 表）
 * 用法：node scripts/db-init.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return;
    for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (_) {}
}

function splitSql(sql) {
  // 简单按分号拆分，忽略注释行
  const lines = sql.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('--');
  });
  const body = lines.join('\n');
  return body
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  loadEnv();
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || 'paiban-root-pwd';
  const database = process.env.DB_NAME || 'paiban';

  const schemaPath = path.resolve(__dirname, '../schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSql(sql);

  console.log('[db-init] connect', { host, port, user, database });
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  try {
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (e) {
        // 已存在等可忽略
        if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DB_CREATE_EXISTS') {
          console.log('[db-init] skip', e.code, stmt.slice(0, 60).replace(/\s+/g, ' '));
          continue;
        }
        console.error('[db-init] fail on:', stmt.slice(0, 120).replace(/\s+/g, ' '));
        throw e;
      }
    }

    // seed-init settings
    const seedInit = path.resolve(__dirname, 'seed-init.sql');
    if (fs.existsSync(seedInit)) {
      const s2 = splitSql(fs.readFileSync(seedInit, 'utf8'));
      for (const stmt of s2) {
        try {
          await conn.query(stmt);
        } catch (e) {
          console.warn('[db-init] seed-init', e.message);
        }
      }
    }

    const [tables] = await conn.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [database]
    );
    console.log(
      '[db-init] tables:',
      tables.map((t) => t.TABLE_NAME || t.table_name).join(', ')
    );
    console.log('[db-init] OK');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[db-init] ERROR', e);
  process.exit(1);
});
