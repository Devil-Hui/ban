'use strict';

/**
 * 灌入众数作息模板种子到 schedule_profiles
 * 用法：node scripts/db-seed-profiles.js
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

async function main() {
  loadEnv();
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || 'paiban-root-pwd';
  const database = process.env.DB_NAME || 'paiban';

  const seedPath = path.resolve(__dirname, '../seeds/schedule-profiles.seed.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const profiles = seed.profiles || [];

  const conn = await mysql.createConnection({ host, port, user, password, database, charset: 'utf8mb4' });
  try {
    for (const p of profiles) {
      await conn.execute(
        `INSERT INTO schedule_profiles
          (id, name, scope, group_id, slots, version, status, is_default, description, locale, tags)
         VALUES (?, ?, 'system', NULL, ?, 1, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           slots = VALUES(slots),
           status = VALUES(status),
           is_default = VALUES(is_default),
           description = VALUES(description),
           locale = VALUES(locale),
           tags = VALUES(tags),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [
          p.id,
          p.name,
          JSON.stringify(p.slots || []),
          p.status || 'active',
          p.isDefault ? 1 : 0,
          p.description || null,
          p.locale || 'zh-CN',
          p.tags ? JSON.stringify(p.tags) : null,
        ]
      );
      console.log('[seed] upsert', p.id, p.name);
    }
    const [rows] = await conn.query(
      "SELECT id, name, is_default, JSON_LENGTH(slots) AS slot_count FROM schedule_profiles WHERE scope='system' ORDER BY is_default DESC, id"
    );
    console.table(rows);
    console.log('[seed] OK count=', rows.length);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[seed] ERROR', e);
  process.exit(1);
});
