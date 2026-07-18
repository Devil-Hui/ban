'use strict';

/** 分组模块：创建、我的分组、详情、加入（邀请码）、成员列表、踢人、退出。 */

const { required, optional } = require('../core/validate');
const { err } = require('../core/errors');
const { requireAuth, requireGroupMember, requireGroupPublisher } = require('./guard');

/** POST /api/v1/groups */
async function create(ctx) {
  const user = requireAuth(ctx);
  const data = required(ctx.body, { name: { type: 'string', label: 'name', maxLen: 40 } });
  const extra = optional(ctx.body, {
    mode: { type: 'string', enum: ['timeline', 'shift', 'custom'], default: 'shift' },
    cycleRule: { type: 'string', enum: ['weekly', 'odd_weekly', 'even_weekly', 'custom'], default: 'weekly' },
    templateStyle: { type: 'int', default: 1, min: 1, max: 3 },
    periods: { type: 'array', default: [] },
  });
  const repos = require('../repositories').getRepos();
  const group = await repos.groups.create(Object.assign({ createdBy: user.userId }, data, extra));
  try {
    const { writeAudit } = require('./audit');
    await writeAudit(repos, ctx, {
      targetType: 'group',
      targetId: group.id,
      action: 'group.create',
      afterValue: { name: group.name, inviteCode: group.inviteCode },
    });
  } catch (_) {}
  return { group };
}

/** GET /api/v1/groups */
async function listMine(ctx) {
  const user = requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  const groups = await repos.groups.listByUserId(user.userId);
  return { groups };
}

/** GET /api/v1/groups/{group_id}
 * 数据链：groups + 当前用户 group_members.role → 注入 myRole，供前端按钮显隐
 */
async function getOne(ctx) {
  const user = requireAuth(ctx);
  const member = await requireGroupMember(ctx, ctx.params.groupId);
  const repos = require('../repositories').getRepos();
  const group = await repos.groups.getById(ctx.params.groupId);
  if (!group) throw err('GROUP_NOT_FOUND');
  return {
    group: Object.assign({}, group, {
      myRole: member.roleInGroup,
      roleInGroup: member.roleInGroup,
    }),
  };
}

/** POST /api/v1/groups/join */
async function join(ctx) {
  const user = requireAuth(ctx);
  const { inviteCode } = required(ctx.body, { inviteCode: { type: 'string', label: 'inviteCode' } });
  const repos = require('../repositories').getRepos();
  const group = await repos.groups.getByInviteCode(inviteCode.trim().toUpperCase());
  if (!group) throw err('INVITE_CODE_INVALID');
  if (await repos.groups.isBlacklisted(group.id, user.userId)) throw err('MEMBER_BLACKLISTED');
  const existing = await repos.groups.getMember(group.id, user.userId);
  if (existing && existing.status === 'active') throw err('ALREADY_MEMBER');
  const member = await repos.groups.addMember({
    groupId: group.id,
    userId: user.userId,
    roleInGroup: 'member',
    displayName: (ctx.body && ctx.body.displayName) || undefined,
  });
  // 站内 + 微信订阅（尽力）
  try {
    const { notifyUser } = require('../services/notify-dispatch');
    await notifyUser(repos, {
      userId: user.userId,
      logicalKey: 'group_joined',
      title: '已加入分组',
      body: `你已加入「${group.name || '分组'}」`,
      groupId: group.id,
      groupName: group.name,
    });
    const members = await repos.groups.listMembers(group.id);
    for (const m of members) {
      if (m.roleInGroup === 'publisher' && String(m.userId) !== String(user.userId)) {
        await notifyUser(repos, {
          userId: m.userId,
          logicalKey: 'group_joined',
          title: '有新成员加入',
          body: `「${group.name || '分组'}」有新成员加入`,
          groupId: group.id,
          groupName: group.name,
        });
      }
    }
  } catch (_) {
    /* 通知失败不阻断加入 */
  }
  return { group, member };
}

/** GET /api/v1/groups/{group_id}/members */
async function listMembers(ctx) {
  const user = requireAuth(ctx);
  await requireGroupMember(ctx, ctx.params.groupId);
  const repos = require('../repositories').getRepos();
  const members = await repos.groups.listMembers(ctx.params.groupId);
  return { members };
}

/** DELETE /api/v1/groups/{group_id}/members/{user_id} —— 发布者踢人 */
async function kick(ctx) {
  const user = requireAuth(ctx);
  await requireGroupPublisher(ctx, ctx.params.groupId);
  const targetId = ctx.params.userId;
  if (targetId === user.userId) throw err('FORBIDDEN', { message: '不能踢出自己' });
  const repos = require('../repositories').getRepos();
  const member = await repos.groups.getMember(ctx.params.groupId, targetId);
  if (!member || member.status !== 'active') throw err('FORBIDDEN', { message: '该用户不是活跃成员' });
  const updated = await repos.groups.updateMember(ctx.params.groupId, targetId, { status: 'kicked', isBlacklisted: 0 });
  return { member: updated };
}

/** POST /api/v1/groups/{group_id}/members/leave —— 自己退出 */
async function leave(ctx) {
  const user = requireAuth(ctx);
  await requireGroupMember(ctx, ctx.params.groupId);
  const repos = require('../repositories').getRepos();
  const active = await repos.groups.countActiveTasks(ctx.params.groupId);
  if (active > 0) throw err('CANNOT_LEAVE');
  const updated = await repos.groups.updateMember(ctx.params.groupId, user.userId, { status: 'left' });
  return { member: updated };
}

/**
 * DELETE /api/v1/groups/{group_id}
 * 设计板「删除分组」：仅发布者；软删 archived + is_deleted
 * body.confirm === true 必填，防误触
 */
async function remove(ctx) {
  const user = requireAuth(ctx);
  await requireGroupPublisher(ctx, ctx.params.groupId);
  const body = ctx.body || {};
  if (body.confirm !== true && body.confirm !== 1 && body.confirm !== 'true') {
    throw err('VALIDATION_ERROR', { message: '请确认删除分组（confirm=true）' });
  }
  const repos = require('../repositories').getRepos();
  const group = await repos.groups.getById(ctx.params.groupId);
  if (!group) throw err('GROUP_NOT_FOUND');
  if (typeof repos.groups.softDelete !== 'function') {
    throw err('INTERNAL_ERROR', { message: '仓储未实现 softDelete' });
  }
  const updated = await repos.groups.softDelete(ctx.params.groupId);
  try {
    const { writeAudit } = require('./audit');
    await writeAudit(repos, ctx, {
      targetType: 'group',
      targetId: ctx.params.groupId,
      action: 'group.delete',
      beforeValue: { name: group.name, status: group.status },
      afterValue: { status: 'archived', isDeleted: 1 },
      reason: body.reason || null,
    });
  } catch (_) {}
  return { group: updated, deleted: true };
}

/**
 * GET /api/v1/groups/{group_id}/unfilled-members?taskId=
 * 设计板「提醒未填写成员」名单
 */
async function listUnfilledMembers(ctx) {
  requireAuth(ctx);
  await requireGroupMember(ctx, ctx.params.groupId);
  const taskId = (ctx.query && (ctx.query.taskId || ctx.query.task_id)) || null;
  const repos = require('../repositories').getRepos();
  if (typeof repos.groups.getUnfilledMembers !== 'function') {
    // fallback: all active members
    const members = await repos.groups.listMembers(ctx.params.groupId);
    return { members: members || [], total: (members || []).length };
  }
  const members = await repos.groups.getUnfilledMembers(ctx.params.groupId, taskId);
  return { members, total: members.length, taskId };
}

/**
 * POST /api/v1/groups/{group_id}/remind-unfilled
 * body: { taskId, userIds? }
 * 站内催填；可选指定 userIds，默认全部未填
 */
async function remindUnfilled(ctx) {
  const user = requireAuth(ctx);
  await requireGroupPublisher(ctx, ctx.params.groupId);
  const taskId = ctx.body && (ctx.body.taskId || ctx.body.task_id);
  if (!taskId) throw err('VALIDATION_ERROR', { message: '缺少 taskId' });
  const repos = require('../repositories').getRepos();
  const task = await repos.tasks.getById(taskId);
  if (!task || String(task.groupId) !== String(ctx.params.groupId)) {
    throw err('TASK_NOT_FOUND');
  }
  let targets = [];
  if (typeof repos.groups.getUnfilledMembers === 'function') {
    targets = await repos.groups.getUnfilledMembers(ctx.params.groupId, taskId);
  } else {
    targets = await repos.groups.listMembers(ctx.params.groupId);
  }
  const only = ctx.body && Array.isArray(ctx.body.userIds) ? ctx.body.userIds.map(String) : null;
  if (only && only.length) {
    targets = targets.filter((m) => only.indexOf(String(m.userId)) >= 0);
  }
  const { notifyUser } = require('../services/notify-dispatch');
  let sent = 0;
  for (const m of targets) {
    await notifyUser(repos, {
      userId: m.userId,
      logicalKey: 'deadline_remind',
      title: '请填写可用时间',
      body: `「${task.title || '排班任务'}」仍待你提交空闲，请尽快填写`,
      taskId: task.id,
      groupId: ctx.params.groupId,
      taskTitle: task.title,
      extra: { statusText: '待填写' },
    });
    sent += 1;
  }
  try {
    const { writeAudit } = require('./audit');
    await writeAudit(repos, ctx, {
      targetType: 'task',
      targetId: taskId,
      action: 'task.remind_unfilled',
      afterValue: { count: sent },
    });
  } catch (_) {}
  return { sent, total: targets.length };
}

module.exports = {
  create,
  listMine,
  getOne,
  join,
  listMembers,
  kick,
  leave,
  remove,
  listUnfilledMembers,
  remindUnfilled,
};
