'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { setup, request } = require('./helpers');

describe('design board APIs', () => {
  let token;
  let groupId;
  let taskId;
  let memberToken;
  let memberId;

  before(async () => {
    setup();
    const a = await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'db_pub' } });
    token = a.accessToken;
    const b = await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'db_mem' } });
    memberToken = b.accessToken;
    memberId = b.user.id;
    const g = await request('POST', '/api/v1/groups', {
      token,
      body: { name: '设计板测试组' },
    });
    groupId = g.group.id;
    await request('POST', '/api/v1/groups/join', {
      token: memberToken,
      body: { inviteCode: g.group.inviteCode },
    });
    const t = await request('POST', `/api/v1/groups/${groupId}/tasks`, {
      token,
      body: {
        title: '设计板任务',
        timeMode: 'range',
        customRanges: [{ start: '09:00', end: '10:00', name: '上午' }],
        constraints: {
          slotMinPeople: 1,
          slotMaxPeople: 2,
          allowOvertime: false,
          slotDurationMinutes: 30,
        },
      },
    });
    taskId = t.task.id;
    assert.equal(t.task.constraints.slotMaxPeople, 2);
  });

  it('lists unfilled members and reminds', async () => {
    const list = await request('GET', `/api/v1/groups/${groupId}/unfilled-members?taskId=${taskId}`, {
      token,
    });
    assert.ok(list.total >= 1);
    const rem = await request('POST', `/api/v1/groups/${groupId}/remind-unfilled`, {
      token,
      body: { taskId },
    });
    assert.ok(rem.sent >= 1);
  });

  it('syncs published assignments into calendar', async () => {
    await request('POST', `/api/v1/tasks/${taskId}/publish`, {
      token,
      body: {
        finalSchedule: {
          schemeName: 'A',
          assignments: [
            {
              date: '2026-05-08',
              periodId: 'p1',
              periodName: '上午',
              userIds: [memberId],
              userNames: ['成员'],
            },
          ],
        },
      },
    });
    const sync = await request('POST', '/api/v1/users/me/calendar/sync-from-published', {
      token: memberToken,
      body: { taskId },
    });
    assert.ok(sync.synced >= 1);
    assert.ok(sync.calendar);
  });

  it('soft deletes group with confirm', async () => {
    const g2 = await request('POST', '/api/v1/groups', {
      token,
      body: { name: '待删组' },
    });
    await assert.rejects(
      () => request('DELETE', `/api/v1/groups/${g2.group.id}`, { token, body: {} }),
      (e) => e && (e.httpStatus === 400 || e.code)
    );
    const del = await request('DELETE', `/api/v1/groups/${g2.group.id}`, {
      token,
      body: { confirm: true },
    });
    assert.equal(del.deleted, true);
  });
});
