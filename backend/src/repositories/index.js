'use strict';

/**
 * 仓储选择器。
 * - DB_MODE=mysql：使用 mysql.js（需配置数据库连接，见 config / .env）
 * - 其他（默认 memory）：使用内存实现，无需数据库即可跑通与测试
 * 同时导出 setRepos，供单元测试注入 mock / 内存实例，验证逻辑链与数据链。
 */

const config = require('../config');
const path = require('path');
const fs = require('fs');

let current = null;
let seedPromise = null;

function loadSeedProfiles() {
  try {
    const seedPath = path.resolve(__dirname, '../../seeds/schedule-profiles.seed.json');
    if (!fs.existsSync(seedPath)) return [];
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    return seed.profiles || [];
  } catch (_) {
    return [];
  }
}

async function ensureMysqlSeeds(repos) {
  if (!repos.scheduleProfiles || !repos.scheduleProfiles.ensureSeeds) return;
  const profiles = loadSeedProfiles();
  if (profiles.length) await repos.scheduleProfiles.ensureSeeds(profiles);
}

function getRepos() {
  if (current) return current;
  if (config.dbMode === 'mysql') {
    const pool = require('../core/db').getPool();
    current = require('./mysql').createMysqlRepos(pool);
    seedPromise = ensureMysqlSeeds(current).catch((e) => {
      console.warn('[repos] seed schedule_profiles failed:', e && e.message);
    });
  } else {
    current = require('./memory').createMemoryRepos();
  }
  return current;
}

function ready() {
  return seedPromise || Promise.resolve();
}

function setRepos(r) {
  current = r;
  seedPromise = null;
}

module.exports = { getRepos, setRepos, ready };
