'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { setup, request } = require('./helpers');

test('系统作息种子已加载且可列出', async () => {
  setup();
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'seed_user' } })).accessToken;
  const res = await request('GET', '/api/v1/schedule-profiles', { token: t1 });
  assert.ok(Array.isArray(res.list));
  assert.ok(res.list.length >= 3, '应至少有多条众数种子');
  const def = res.list.find((p) => p.isDefault);
  assert.ok(def, '应有默认模板');
  assert.ok(def.slots && def.slots.length >= 4);
  assert.ok(def.slots[0].start, '种子应含时间，非页面硬编码');
});

test('GET meta/time-constants 返回三 mode', async () => {
  setup();
  const meta = await request('GET', '/api/v1/meta/time-constants');
  assert.ok(meta.TIME_MODE_META.section);
  assert.ok(meta.TIME_MODE_META.range);
  assert.ok(meta.TIME_MODE_META.section_range);
  assert.strictEqual(meta.DEFAULT_TASK_TIME_MODE, 'section_range');
});

test('创建任务：timeMode=section_range 从默认种子快照 periods', async () => {
  setup();
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'pub1' } })).accessToken;
  const group = (await request('POST', '/api/v1/groups', { token: t1, body: { name: '作息组' } })).group;
  const task = (
    await request('POST', `/api/v1/groups/${group.id}/tasks`, {
      token: t1,
      body: {
        title: '按节次+时间',
        timeMode: 'section_range',
        dateRangeStart: '2026-09-01',
        dateRangeEnd: '2026-09-07',
      },
    })
  ).task;
  assert.strictEqual(task.timeMode, 'section_range');
  assert.ok(Array.isArray(task.periods) && task.periods.length >= 4);
  assert.ok(task.periods[0].id);
  assert.ok(task.periods[0].start);
  assert.ok(task.scheduleProfileId);
});

test('创建任务：timeMode=range 使用值班2小时种子', async () => {
  setup();
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'pub2' } })).accessToken;
  const group = (await request('POST', '/api/v1/groups', { token: t1, body: { name: '值班组' } })).group;
  const task = (
    await request('POST', `/api/v1/groups/${group.id}/tasks`, {
      token: t1,
      body: {
        title: '周末值班',
        timeMode: 'range',
        scheduleProfileId: 'sys_duty_2h_v1',
      },
    })
  ).task;
  assert.strictEqual(task.timeMode, 'range');
  assert.ok(task.periods.length >= 3);
  assert.ok(task.periods[0].start && task.periods[0].end);
});

test('创建任务：显式 periods 优先生效', async () => {
  setup();
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'pub3' } })).accessToken;
  const group = (await request('POST', '/api/v1/groups', { token: t1, body: { name: '自定义组' } })).group;
  const task = (
    await request('POST', `/api/v1/groups/${group.id}/tasks`, {
      token: t1,
      body: {
        title: '自定义两段',
        timeMode: 'range',
        periods: [
          { id: 'x1', name: 'A', start: '09:00', end: '11:00' },
          { id: 'x2', name: 'B', start: '14:00', end: '16:00' },
        ],
      },
    })
  ).task;
  assert.strictEqual(task.periods.length, 2);
  assert.strictEqual(task.periods[0].id, 'x1');
});
