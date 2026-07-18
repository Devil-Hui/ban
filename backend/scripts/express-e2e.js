'use strict';

/**
 * Express × MySQL 端到端验证：
 * 起 HTTP 服务 → MP 登录 → 建组 → 加成员 → 查库确认数据落盘
 * 注入 wx verifier 以绕过真实微信服务器。
 * 结束后清理测试数据并停止服务器。
 */

const http = require('http');
const { setRepos } = require('../src/repositories');
const { setWxLoginVerifier } = require('../src/core/auth');
const config = require('../src/config');

// ---- 注入 verifier ----
setWxLoginVerifier((code) => 'openid_' + code);

const app = require('../src/server/express');
const server = http.createServer(app);

const TEST_USER_COUNT = 3;
const GROUP_NAME = 'E2E测试-Express-MySQL-' + Date.now();

function fetch(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      method,
      path,
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'X-Client-Type': 'miniprogram', ...opts.headers },
        body ? { 'Content-Length': Buffer.byteLength(body) } : {}
      ),
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
}

async function main() {
  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  console.log(`▶ Express 已启动 (127.0.0.1:${port})`);

  // ===== 1. MP 登录 =====
  const tokens = [];
  for (let i = 0; i < TEST_USER_COUNT; i++) {
    const r = await fetch('POST', '/api/v1/auth/miniprogram/login', {
      body: { code: `test_user_${i}` },
    });
    if (r.status !== 200 || !r.data.data.accessToken) {
      throw new Error(`用户 ${i} 登录失败: ${JSON.stringify(r)}`);
    }
    tokens.push(r.data.data.accessToken);
    const p = jwtPayload(r.data.data.accessToken);
    console.log(`  ✓ 用户 ${i} 登录成功 (userId=${p.userId})`);
  }

  // ===== 2. 建组 =====
  const r1 = await fetch('POST', '/api/v1/groups', {
    headers: { Authorization: 'Bearer ' + tokens[0] },
    body: { name: GROUP_NAME },
  });
  if (r1.status !== 200 || !r1.data.data) throw new Error(`建组失败: ${JSON.stringify(r1)}`);
  const group = r1.data.data.group;
  console.log(`  ✓ 分组已创建 (id=${group.id}, inviteCode=${group.inviteCode})`);

  // ===== 3. 用户 1、2 加入 =====
  for (let i = 1; i < TEST_USER_COUNT; i++) {
    const r = await fetch('POST', '/api/v1/groups/join', {
      headers: { Authorization: 'Bearer ' + tokens[i] },
      body: { inviteCode: group.inviteCode },
    });
    if (r.status !== 200) throw new Error(`用户 ${i} 加入失败: ${JSON.stringify(r)}`);
  }
  console.log('  ✓ 用户 1、2 已加入分组');

  // ===== 4. 查成员列表 =====
  const r2 = await fetch('GET', `/api/v1/groups/${group.id}/members`, {
    headers: { Authorization: 'Bearer ' + tokens[0] },
  });
  if (r2.status !== 200 || r2.data.data.members.length !== 3) {
    throw new Error(`成员列表异常: ${JSON.stringify(r2)}`);
  }
  console.log('  ✓ 成员列表 3 人正确');

  // ===== 5. 查数据库确认数据落盘 =====
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password,
    database: config.db.database,
  });
  const [groups] = await conn.execute('SELECT * FROM `groups` WHERE id = ?', [group.id]);
  const [members] = await conn.execute('SELECT * FROM group_members WHERE group_id = ?', [group.id]);
  console.log(`  ✓ 数据库确认：groups ${groups.length} 行, group_members ${members.length} 行`);
  if (groups.length !== 1 || members.length !== 3) {
    throw new Error('数据库数据不一致');
  }

  // ===== 清理 =====
  await conn.execute('DELETE FROM group_members WHERE group_id = ?', [group.id]);
  await conn.execute('DELETE FROM `groups` WHERE id = ?', [group.id]);
  await conn.end();
  console.log('  ✓ 测试数据已清理');

  server.close();
  console.log('\n✅ Express × MySQL 端到端全部通过！');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ 失败:', err.message || err);
  server.close();
  process.exit(1);
});
