'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { setup, request } = require('./helpers');

async function publisherAndGroup(code, name) {
  const token = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code } })).accessToken;
  const group = (await request('POST', '/api/v1/groups', { token, body: { name } })).group;
  return { token, group };
}

test('创建任务：发布者可在自己分组下建任务', async () => {
  setup();
  const { token, group } = await publisherAndGroup('u1', 'G');
  const res = await request('POST', `/api/v1/groups/${group.id}/tasks`, {
    token,
    body: { title: '7月值日', deadline: '2026-07-10T12:00:00Z' },
  });
  assert.strictEqual(res.task.title, '7月值日');
  assert.strictEqual(res.task.status, 'collecting');
});

test('创建任务：非发布者报 1204', async () => {
  setup();
  const { token, group } = await publisherAndGroup('u1', 'G');
  const t2 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u2' } })).accessToken;
  await request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: group.inviteCode } });
  await assert.rejects(
    () => request('POST', `/api/v1/groups/${group.id}/tasks`, { token: t2, body: { title: 'x' } }),
    (e) => e.code === 1204
  );
});

test('生成方案：有效空闲不足返回 1306', async () => {
  setup();
  const { token, group } = await publisherAndGroup('u1', 'G');
  const task = (await request('POST', `/api/v1/groups/${group.id}/tasks`, { token, body: { title: 'T' } })).task;
  await assert.rejects(
    () => request('POST', `/api/v1/tasks/${task.id}/scheme-jobs`, { token }),
    (e) => e.code === 1306
  );
});

test('生成方案：有足够空闲后创建异步 job', async () => {
  setup();
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u1' } })).accessToken;
  const t2 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u2' } })).accessToken;
  const group = (await request('POST', '/api/v1/groups', { token: t1, body: { name: 'G' } })).group;
  await request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: group.inviteCode } });
  const task = (await request('POST', `/api/v1/groups/${group.id}/tasks`, { token: t1, body: { title: 'T' } })).task;
  await request('PUT', `/api/v1/tasks/${task.id}/responses/me`, { token: t2, body: { availableSlots: ['2026-07-10|p1'] } });
  const gen = await request('POST', `/api/v1/tasks/${task.id}/scheme-jobs`, { token: t1 });
  assert.ok(gen.jobId);
  // 联调/B2B：生成同步完成并落 candidate_schedules
  assert.strictEqual(gen.status, 'success');
  const detail = (await request('GET', `/api/v1/tasks/${task.id}`, { token: t1 })).task;
  assert.ok(detail.candidateSchedules && detail.candidateSchedules.length >= 1);
});

test('发布任务：写入最终方案、分配快照与分享 token', async () => {
  setup();
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u1' } })).accessToken;
  const t2 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u2' } })).accessToken;
  const group = (await request('POST', '/api/v1/groups', { token: t1, body: { name: 'G' } })).group;
  await request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: group.inviteCode } });
  const task = (await request('POST', `/api/v1/groups/${group.id}/tasks`, { token: t1, body: { title: 'T' } })).task;
  await request('PUT', `/api/v1/tasks/${task.id}/responses/me`, { token: t2, body: { availableSlots: ['2026-07-10|p1'] } });
  await request('POST', `/api/v1/tasks/${task.id}/scheme-jobs`, { token: t1 });
  const finalSchedule = {
    schemeName: '方案A',
    assignments: [{ date: '2026-07-10', periodId: 'p1', periodName: '早班', userIds: [task.id ? 'u_2' : 'u_2'], userNames: ['小红'] }],
  };
  const pub = await request('POST', `/api/v1/tasks/${task.id}/publish`, { token: t1, body: { finalSchedule } });
  assert.strictEqual(pub.task.status, 'published');
  assert.ok(pub.shareToken);
  assert.ok(pub.previewUrl.includes(pub.shareToken));
});

test('取消任务：发布者可将任务归档', async () => {
  setup();
  const { token, group } = await publisherAndGroup('u1', 'G');
  const task = (await request('POST', `/api/v1/groups/${group.id}/tasks`, { token, body: { title: 'T' } })).task;
  const res = await request('POST', `/api/v1/tasks/${task.id}/cancel`, { token });
  assert.strictEqual(res.task.status, 'archived');
});
