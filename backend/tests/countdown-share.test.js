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

describe('notify templates dual-mode', () => {
  it('meta notify-templates exposes catalog (wechat_subscribe when IDs configured)', async () => {
    setup();
    const res = await request('GET', '/api/v1/meta/notify-templates');
    assert.ok(res.mode === 'inbox_only' || res.mode === 'wechat_subscribe');
    assert.ok(Array.isArray(res.items));
    assert.ok(Array.isArray(res.logicalKeys));
    assert.ok(res.logicalKeys.includes('task_published'));
    assert.ok(res.logicalKeys.includes('deadline_remind'));
    // 已配置真实模板时，mode 为 wechat_subscribe 且 wxReadyIds 非空
    if (res.mode === 'wechat_subscribe') {
      assert.ok(Array.isArray(res.wxReadyIds) && res.wxReadyIds.length >= 1);
    }
  });

  it('subscribe with keys persists and returns current mode', async () => {
    const repos = setup();
    const login = await request('POST', '/api/v1/auth/miniprogram/login', {
      body: { code: 'sub_keys_user' },
    });
    const res = await request('POST', '/api/v1/notify/subscribe', {
      token: login.accessToken,
      body: { keys: ['task_published', 'deadline_remind'] },
    });
    assert.ok(res.accepted.length >= 1);
    assert.ok(res.mode === 'inbox_only' || res.mode === 'wechat_subscribe');
    const saved = await repos.subscriptions.get(login.user.id);
    assert.ok(saved);
  });
});

describe('wechat subscribe send dispatch', () => {
  it('publish enqueues inbox and attempts wx send via injectable sender', async () => {
    const { setSubscribeSender, clearTokenCache } = require('../src/core/wechat-subscribe');
    const sent = [];
    setSubscribeSender(async (opts) => {
      sent.push(opts);
      return { ok: true, mocked: true };
    });
    clearTokenCache();

    const repos = setup();
    // 给用户真实形态 openid（非 dev_ 前缀）以便走发送路径
    const login = await request('POST', '/api/v1/auth/miniprogram/login', {
      body: { code: 'wx_send_user' },
    });
    const token = login.accessToken;
    const uid = login.user.id;
    const u = await repos.users.getById(uid);
    // memory: mutate openid
    const raw = await repos.users.getById(uid);
    // patch via store if needed - updateProfile may not set openid; direct map
    if (raw) {
      // re-upsert is hard; monkey-patch getById once
      const orig = repos.users.getById.bind(repos.users);
      repos.users.getById = async (id) => {
        const x = await orig(id);
        if (x && String(x.id) === String(uid)) {
          return Object.assign({}, x, { openid: 'oREAL_openid_test_user' });
        }
        return x;
      };
    }

    await request('POST', '/api/v1/notify/subscribe', {
      token,
      body: {
        templateIds: ['mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg'],
        accepted: ['mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg', 'task_published'],
        keys: ['task_published'],
      },
    });

    const g = await request('POST', '/api/v1/groups', {
      token,
      body: { name: '发送测试组' },
    });
    const groupId = g.group.id;
    const t = await request('POST', `/api/v1/groups/${groupId}/tasks`, {
      token,
      body: {
        title: '发送测试任务',
        timeMode: 'range',
        customRanges: [{ start: '09:00', end: '10:00', name: '上午' }],
      },
    });
    await request('POST', `/api/v1/tasks/${t.task.id}/publish`, {
      token,
      body: {
        finalSchedule: {
          schemeName: 'A',
          assignments: [{ date: '2026-07-20', periodId: 'p1', userNames: ['甲'] }],
        },
      },
    });

    const inbox = await repos.notify.listInbox(uid);
    assert.ok(inbox.list.some((m) => m.title === '排班已发布' || (m.title && m.title.includes('发布'))));
    // 发布者自己也是成员，应尝试微信发送
    assert.ok(sent.length >= 1);
    assert.equal(sent[0].touser, 'oREAL_openid_test_user');
    assert.ok(sent[0].templateId);
    assert.ok(sent[0].data);

    setSubscribeSender(null);
  });
});
