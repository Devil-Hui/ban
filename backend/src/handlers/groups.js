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
  // 站内通知：加入者 + 发布者（不依赖微信模板也能看到）
  try {
    await repos.notify.enqueue({
      userId: user.userId,
      taskId: null,
      templateId: 'group_joined',
      title: '已加入分组',
      body: `你已加入「${group.name || '分组'}」`,
    });
    const members = await repos.groups.listMembers(group.id);
    for (const m of members) {
      if (m.roleInGroup === 'publisher' && String(m.userId) !== String(user.userId)) {
        await repos.notify.enqueue({
          userId: m.userId,
          taskId: null,
          templateId: 'group_joined',
          title: '有新成员加入',
          body: `「${group.name || '分组'}」有新成员加入`,
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

module.exports = { create, listMine, getOne, join, listMembers, kick, leave };
