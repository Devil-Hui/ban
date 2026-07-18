'use strict';

/**
 * 截止调度 worker CLI
 *   node scripts/run-deadline-worker.js
 *   node scripts/run-deadline-worker.js --once
 *
 * 扫描 countdowns 到期项：提醒站内消息 / 收集截止推进 reviewing。
 * 可用系统 cron / 任务计划程序每分钟调用一次。
 */

require('../src/config');
const { getRepos, ready } = require('../src/repositories');
const { processDueCountdowns } = require('../src/workers/deadline-worker');

async function main() {
  await ready();
  const repos = getRepos();
  const result = await processDueCountdowns(repos);
  console.log(
    '[deadline-worker]',
    new Date().toISOString(),
    JSON.stringify(result)
  );
  // mysql 连接池可能挂起进程：主动退出
  if (process.env.DB_MODE === 'mysql') {
    try {
      const { getPool } = require('../src/core/db');
      const pool = getPool();
      if (pool && pool.end) await pool.end();
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error('[deadline-worker] ERROR', e && e.message ? e.message : e);
  process.exit(1);
});
