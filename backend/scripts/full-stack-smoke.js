'use strict';

/**
 * 全链路 API 冒烟（小程序角色 + H5 admin 同源）。
 * 默认 memory；要打真实 MySQL：
 *   DB_MODE=mysql node scripts/full-stack-smoke.js
 *
 * 退出码 0 = 全部通过。
 */

const path = require('path');
// 确保加载 backend 包根 .env
process.chdir(path.resolve(__dirname, '..'));
require('../src/config');

const { setRepos, getRepos } = require('../src/repositories');
const { createMemoryRepos } = require('../src/repositories/memory');
const { match } = require('../src/server/routes');
const { setWxLoginVerifier, verifyToken } = require('../src/core/auth');
const config = require('../src/config');

function parseQs(qs) {
  const o = {};
  if (!qs) return o;
  for (const pair of qs.split('&')) {
    const i = pair.indexOf('=');
    const k = i < 0 ? pair : pair.slice(0, i);
    const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1));
    if (k) o[k] = v;
  }
  return o;
}

async function request(method, pathUrl, opts = {}) {
  const [pure, qs] = pathUrl.split('?');
  const m = match(method, pure);
  if (!m) throw new Error('no route ' + method + ' ' + pathUrl);
  let user = opts.user || null;
  if (opts.token) {
    const p = verifyToken(opts.token);
    user = { userId: p.userId, role: p.role };
  }
  const headers = Object.assign({ 'x-client-type': opts.clientType || 'miniprogram' }, opts.headers || {});
  const ctx = {
    params: m.params,
    query: Object.assign({}, parseQs(qs), opts.query || {}),
    body: opts.body || {},
    headers,
    clientType: headers['x-client-type'] === 'h5' ? 'h5' : 'miniprogram',
    user,
    requestId: 'smoke',
  };
  return m.route.handler(ctx);
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT ' + msg);
}

async function main() {
  const mode = config.dbMode;
  console.log('[smoke] DB_MODE=%s DB_NAME=%s', mode, config.db.database);

  if (mode === 'memory') {
    setRepos(createMemoryRepos());
    setWxLoginVerifier((code) => 'openid_smoke_' + code);
  } else {
    // mysql：使用真实仓储；开发 code 换假 openid 若无 secret
    setWxLoginVerifier((code) => 'openid_smoke_' + code);
    await require('../src/repositories').ready().catch(() => null);
  }

  const repos = getRepos();
  const steps = [];

  // 1) H5 admin login + settings
  const adminLogin = await request('POST', '/api/v1/auth/h5/login', {
    clientType: 'h5',
    body: {
      username: config.h5.adminUsername,
      password: config.h5.adminPassword,
    },
  });
  assert(adminLogin.accessToken, 'h5 login token');
  steps.push('H5 login OK');

  const settingsPut = await request('PUT', '/api/v1/admin/settings', {
    token: adminLogin.accessToken,
    body: { defaultTimeMode: 'section_range' },
  });
  assert(settingsPut.settings && settingsPut.settings.defaultTimeMode, 'admin settings');
  steps.push('H5 settings write OK');

  // 2) two mini users
  const a = await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'smoke_pub' } });
  const b = await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'smoke_mem' } });
  assert(a.accessToken && b.accessToken, 'mini login');
  steps.push('Mini users login OK');

  // 3) group + join
  const g = await request('POST', '/api/v1/groups', {
    token: a.accessToken,
    body: { name: '冒烟测试组' },
  });
  assert(g.group && g.group.id, 'create group');
  const invite = g.group.inviteCode;
  assert(invite, 'invite code');

  await request('POST', '/api/v1/groups/join', {
    token: b.accessToken,
    body: { inviteCode: invite },
  });
  steps.push('Group create+join OK');

  // 4) task with deadline（MySQL DATETIME 避免 ISO Z 后缀）
  const d = new Date(Date.now() + 36 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const deadline = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const t = await request('POST', `/api/v1/groups/${g.group.id}/tasks`, {
    token: a.accessToken,
    body: {
      title: '冒烟排班任务',
      deadline,
      timeMode: 'range',
      customRanges: [
        { start: '09:00', end: '10:00', name: '上午' },
        { start: '14:00', end: '15:00', name: '下午' },
      ],
      dateRangeStart: '2026-07-20',
      dateRangeEnd: '2026-07-21',
    },
  });
  assert(t.task && t.task.id, 'create task');
  const taskId = t.task.id;
  if (repos.countdowns && repos.countdowns.listByTask) {
    const cds = await repos.countdowns.listByTask(taskId);
    assert(cds.length >= 1, 'countdowns scheduled');
  }
  steps.push('Task+countdown OK');

  // 5) member response
  const periods = t.task.periods || [];
  const pid = periods[0] && periods[0].id;
  await request('PUT', `/api/v1/tasks/${taskId}/responses/me`, {
    token: b.accessToken,
    body: {
      availability: [{ date: '2026-07-20', slots: pid ? [pid] : ['上午'] }],
    },
  });
  steps.push('Response submit OK');

  // 6) generate + publish
  try {
    await request('POST', `/api/v1/tasks/${taskId}/scheme-jobs`, { token: a.accessToken });
  } catch (e) {
    // 空闲不足时仍允许直接 publish 带 finalSchedule
    if (e.code !== 1306) throw e;
  }
  const pub = await request('POST', `/api/v1/tasks/${taskId}/publish`, {
    token: a.accessToken,
    body: {
      finalSchedule: {
        schemeName: '冒烟方案',
        assignments: [
          {
            date: '2026-07-20',
            periodId: pid || 'p1',
            periodName: '上午',
            userIds: [b.user.id],
            userNames: [b.user.nickname || '成员'],
          },
        ],
      },
    },
  });
  assert(pub.shareToken, 'share token');
  assert(pub.task && pub.task.status === 'published', 'published');
  steps.push('Publish OK');

  // 7) share preview desensitize
  const preview = await request(
    'GET',
    `/api/v1/share/tasks/${taskId}?token=${pub.shareToken}`
  );
  assert(preview.meta && preview.meta.desensitized, 'desensitized');
  steps.push('Share preview OK');

  // 8) inbox for member
  const inbox = await request('GET', '/api/v1/users/me/inbox', { token: b.accessToken });
  assert(Array.isArray(inbox.list), 'inbox list');
  steps.push('Inbox OK');

  // 9) audit logs for admin
  const audits = await request('GET', '/api/v1/admin/audit-logs?pageSize=10', {
    token: adminLogin.accessToken,
  });
  assert(Array.isArray(audits.list), 'audit list');
  assert(audits.list.some((x) => String(x.action).startsWith('task.') || x.action === 'group.create'), 'audit has ops');
  steps.push('Audit logs OK');

  // 10) notify templates meta
  const meta = await request('GET', '/api/v1/meta/notify-templates');
  assert(meta.mode === 'wechat_subscribe' || meta.mode === 'inbox_only', 'notify mode');
  steps.push('Notify meta OK mode=' + meta.mode);

  console.log('\n✅ FULL STACK SMOKE PASSED\n');
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log('\nmode=%s taskId=%s shareToken=%s…\n', mode, taskId, String(pub.shareToken).slice(0, 8));

  if (mode === 'mysql') {
    try {
      const { getPool } = require('../src/core/db');
      const pool = getPool();
      if (pool && pool.end) await pool.end();
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error('\n❌ SMOKE FAILED:', e && e.message ? e.message : e);
  if (e && e.code) console.error('code=', e.code);
  process.exit(1);
});
