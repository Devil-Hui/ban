'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { setup, request } = require('./helpers');
const { getRepos } = require('../src/repositories');

/**
 * 端到端逻辑链 + 数据链验证：
 * 登录 → 建组 → 加入 → 建任务 → 标记空闲 → 异步生成方案 → 发布 → H5 预览 → 异议 → 调整
 * 覆盖用户/分组/任务/空闲/分享/消息全模块，验证状态机与数据一致。
 */
test('E2E：完整排班生命周期数据链一致', async () => {
  const repos = setup();

  // 1. 登录：发布者 u1、成员 u2
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u1' } })).accessToken;
  const t2 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u2' } })).accessToken;
  const u2Id = (await request('GET', '/api/v1/users/me', { token: t2 })).user.id;
  const u2Name = (await request('GET', '/api/v1/users/me', { token: t2 })).user.nickname;

  // 2. 建组
  const group = (await request('POST', '/api/v1/groups', { token: t1, body: { name: '七月值日' } })).group;
  // 3. 加入
  await request('POST', '/api/v1/groups/join', { token: t2, body: { inviteCode: group.inviteCode } });
  const members = (await request('GET', `/api/v1/groups/${group.id}/members`, { token: t1 })).members;
  assert.strictEqual(members.length, 2);

  // 4. 建任务
  const task = (await request('POST', `/api/v1/groups/${group.id}/tasks`, { token: t1, body: { title: '7月值日表' } })).task;
  assert.strictEqual(task.status, 'collecting');

  // 5. 标记空闲
  await request('PUT', `/api/v1/tasks/${task.id}/responses/me`, { token: t2, body: { availableSlots: ['2026-07-10|p1', '2026-07-11|p1'] } });
  const myResp = (await request('GET', `/api/v1/tasks/${task.id}/responses/me`, { token: t2 })).response;
  assert.deepStrictEqual(myResp.availableSlots, ['2026-07-10|p1', '2026-07-11|p1']);
  // 标记阶段：成员互相不可见——仅返回自己的
  const allResp = await repos.responses.listByTask(task.id);
  assert.strictEqual(allResp.length, 1);
  assert.strictEqual(allResp[0].userId, u2Id);

  // 6. 触发异步生成方案
  const gen = await request('POST', `/api/v1/tasks/${task.id}/scheme-jobs`, { token: t1 });
  assert.ok(gen.jobId);
  // 模拟后台 worker 完成：写入候选方案 + job 成功
  const updated = await repos.tasks.updateWithVersion(task.id, { candidateSchedules: [{ schemeName: 'A', score: 90 }] }, (await repos.tasks.getById(task.id)).version);
  await repos.tasks.updateJob(gen.jobId, { status: 'success', result: { scheme: 'A' } });
  assert.ok(updated.candidateSchedules);

  // 7. 发布
  const finalSchedule = {
    schemeName: '方案A',
    assignments: [{ date: '2026-07-10', periodId: 'p1', periodName: '早班', userIds: [u2Id], userNames: [u2Name] }],
  };
  const pub = await request('POST', `/api/v1/tasks/${task.id}/publish`, { token: t1, body: { finalSchedule } });
  assert.strictEqual(pub.task.status, 'published');
  assert.ok(pub.shareToken);
  // 分配快照已落库
  const assignments = await repos.tasks.listAssignments(task.id, { activeOnly: true });
  assert.strictEqual(assignments.length, 1);
  assert.strictEqual(assignments[0].userId, u2Id);
  // 消息中心已推送
  const inbox = (await request('GET', '/api/v1/users/me/inbox', { token: t2 })).list;
  assert.ok(inbox.find((m) => m.title === '排班已发布'));

  // 8. H5 公开预览（无需登录，凭 token 只读，姓名脱敏）
  const preview = await request('GET', `/api/v1/share/tasks/${task.id}?token=${pub.shareToken}`);
  const previewName = preview.task.schedule.assignments[0].userNames[0];
  assert.ok(previewName.includes('*'), '分享预览姓名应脱敏');
  assert.notStrictEqual(previewName, u2Name);
  // 过期/错误 token 被拒
  await assert.rejects(() => request('GET', `/api/v1/share/tasks/${task.id}?token=bad`), (e) => e.code === 1601);

  // 9. 成员提出异议
  const obj = await request('POST', `/api/v1/tasks/${task.id}/receipts/me/objection`, { token: t2, body: { objectionReason: '当天有课' } });
  assert.strictEqual(obj.receipt.objectionReason, '当天有课');

  // 10. 发布者调整后重新发布（previousSchedule 备份）
  const prev = (await repos.tasks.getById(task.id)).finalSchedule;
  const adjustFinal = {
    schemeName: '方案A-修订',
    assignments: [{ date: '2026-07-10', periodId: 'p2', periodName: '晚班', userIds: [u2Id], userNames: [u2Name] }],
  };
  const adj = await request('POST', `/api/v1/tasks/${task.id}/adjust`, { token: t1, body: { finalSchedule: adjustFinal } });
  assert.strictEqual(adj.task.status, 'published');
  const after = await repos.tasks.getById(task.id);
  assert.deepStrictEqual(after.previousSchedule, prev);
});
