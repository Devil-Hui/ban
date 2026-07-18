'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { buildCountdownPlan, actionForCountdown } = require('../src/domain/countdown');
const { processDueCountdowns } = require('../src/workers/deadline-worker');
const { setup, request } = require('./helpers');

describe('countdown domain', () => {
  it('buildCountdownPlan empty without deadline', () => {
    assert.deepEqual(buildCountdownPlan(null), []);
    assert.deepEqual(buildCountdownPlan(''), []);
  });

  it('buildCountdownPlan writes reminder + deadline when far enough', () => {
    const now = Date.parse('2026-07-18T00:00:00.000Z');
    const deadline = '2026-07-20T12:00:00.000Z';
    const plan = buildCountdownPlan(deadline, { reminderHours: 24, now });
    assert.equal(plan.length, 2);
    assert.equal(plan[0].type, 'reminder');
    assert.equal(plan[1].type, 'deadline');
    assert.ok(Date.parse(plan[0].triggerAt) < Date.parse(plan[1].triggerAt));
  });

  it('actionForCountdown only closes collecting', () => {
    assert.equal(actionForCountdown('deadline', 'collecting'), 'to_reviewing');
    assert.equal(actionForCountdown('deadline', 'published'), 'noop');
    assert.equal(actionForCountdown('reminder', 'collecting'), 'noop');
  });
});

describe('deadline worker + share preview', () => {
  let repos;
  let token;
  let groupId;
  let taskId;
  let userId;

  before(async () => {
    repos = setup();
    const login = await request('POST', '/api/v1/auth/miniprogram/login', {
      body: { code: 'worker_user' },
    });
    token = login.accessToken;
    userId = login.user.id;
    const g = await request('POST', '/api/v1/groups', {
      token,
      body: { name: '截止测试组' },
    });
    groupId = g.group.id;
  });

  it('create task with deadline schedules countdowns', async () => {
    const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const res = await request('POST', `/api/v1/groups/${groupId}/tasks`, {
      token,
      body: {
        title: '有截止任务',
        deadline,
        timeMode: 'range',
        customRanges: [{ start: '09:00', end: '10:00', name: '上午' }],
      },
    });
    taskId = res.task.id;
    const cds = await repos.countdowns.listByTask(taskId);
    assert.ok(cds.length >= 1);
    assert.ok(cds.some((c) => c.type === 'deadline'));
  });

  it('worker processes past deadline into reviewing', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await repos.countdowns.replaceForTask(taskId, [{ type: 'deadline', triggerAt: past }]);
    const result = await processDueCountdowns(repos, { now: Date.now() });
    assert.ok(result.processed >= 1);
    const task = await repos.tasks.getById(taskId);
    assert.equal(task.status, 'reviewing');
  });

  it('share token invalid / expired / desensitized', async () => {
    const pub = await request('POST', `/api/v1/tasks/${taskId}/publish`, {
      token,
      body: {
        finalSchedule: {
          schemeName: '测',
          assignments: [
            {
              date: '2026-07-20',
              periodId: 'p1',
              periodName: '上午',
              userNames: ['张三', '李四'],
              userIds: [1, 2],
            },
          ],
        },
      },
    });
    assert.ok(pub.shareToken);

    await assert.rejects(
      () => request('GET', `/api/v1/share/tasks/${taskId}?token=badtoken`),
      (e) => e && e.code === 1601
    );

    const ok = await request(
      'GET',
      `/api/v1/share/tasks/${taskId}?token=${pub.shareToken}`
    );
    assert.equal(String(ok.task.id), String(taskId));
    assert.equal(ok.meta.desensitized, true);
    const names = ok.task.schedule.assignments[0].userNames;
    assert.ok(names.every((n) => n.includes('*')));
    assert.ok(!JSON.stringify(ok).includes('"userIds"'));

    const expiredToken = await repos.tasks.createShareToken(taskId, -10);
    await assert.rejects(
      () => request('GET', `/api/v1/share/tasks/${taskId}?token=${expiredToken}`),
      (e) => e && e.code === 1602
    );
  });

  it('subscribe persists accepted templates', async () => {
    const res = await request('POST', '/api/v1/notify/subscribe', {
      token,
      body: { templateIds: ['tmpl_a', 'tmpl_b'], accepted: ['tmpl_a'] },
    });
    assert.deepEqual(res.accepted, ['tmpl_a']);
    const saved = await repos.subscriptions.get(userId);
    assert.ok(saved);
    assert.deepEqual(saved.accepted, ['tmpl_a']);
  });
});
