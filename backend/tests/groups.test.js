'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { setup, request } = require('./helpers');

async function login(code) {
  const r = await request('POST', '/api/v1/auth/miniprogram/login', { body: { code } });
  return r.accessToken;
}

test('创建分组：创建者自动成为 publisher', async () => {
  setup();
  const token = await login('u1');
  const res = await request('POST', '/api/v1/groups', { token, body: { name: '值日组' } });
  assert.strictEqual(res.group.name, '值日组');
  assert.ok(res.group.inviteCode);
});

test('加入分组：邀请码正确可加入；重复加入报 1203', async () => {
  setup();
  const t1 = await login('u1');
  const g = (await request('POST', '/api/v1/groups', { token: t1, body: { name: 'G' } })).group;
  const t2 = await login('u2');
  const join = await request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: g.inviteCode } });
  assert.strictEqual(join.group.id, g.id);
  await assert.rejects(
    () => request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: g.inviteCode } }),
    (e) => e.code === 1203
  );
});

test('加入分组：错误邀请码返回 1202', async () => {
  setup();
  const t = await login('u1');
  await assert.rejects(
    () => request('POST', '/api/v1/groups/join', { token: t, body: { inviteCode: 'ZZZZZZ' } }),
    (e) => e.code === 1202
  );
});

test('成员列表：发布者可查看；非成员不可查看', async () => {
  setup();
  const t1 = await login('u1');
  const g = (await request('POST', '/api/v1/groups', { token: t1, body: { name: 'G' } })).group;
  const t2 = await login('u2');
  await request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: g.inviteCode } });
  const members = (await request('GET', `/api/v1/groups/${g.id}/members`, { token: t1 })).members;
  assert.strictEqual(members.length, 2);
});

test('踢人：发布者可踢成员；非发布者（活跃成员）踢人报 1204', async () => {
  setup();
  const t1 = await login('u1');
  const g = (await request('POST', '/api/v1/groups', { token: t1, body: { name: 'G' } })).group;
  const t2 = await login('u2');
  const t3 = await login('u3');
  const u2 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u2' } }));
  const u2Id = (await request('GET', '/api/v1/users/me', { token: u2.accessToken })).user.id;
  await request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: g.inviteCode } });
  await request('POST', '/api/v1/groups/join', { token: t3, body: { inviteCode: g.inviteCode } });
  const kick = await request('DELETE', `/api/v1/groups/${g.id}/members/${u2Id}`, { token: t1 });
  assert.strictEqual(kick.member.status, 'kicked');
  // 非发布者（u3 是活跃成员）踢人 → 1204
  await assert.rejects(
    () => request('DELETE', `/api/v1/groups/${g.id}/members/${u2Id}`, { token: t3 }),
    (e) => e.code === 1204
  );
});
