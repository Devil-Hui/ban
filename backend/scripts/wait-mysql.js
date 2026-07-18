'use strict';

/** 等待 MySQL 容器可连接 */
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

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

async function main() {
  loadEnv();
  const conf = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'paiban-root-pwd',
  };
  const max = 60;
  for (let i = 1; i <= max; i++) {
    try {
      const conn = await mysql.createConnection(conf);
      await conn.query('SELECT 1');
      await conn.end();
      console.log('[wait-mysql] ready after', i, 'tries');
      return;
    } catch (e) {
      console.log('[wait-mysql] try', i, e.code || e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('[wait-mysql] timeout');
  process.exit(1);
}

main();
