'use strict';

/** 处理器共用守卫：鉴权、发布者校验。统一抛出 ApiError，由适配器统一格式化。 */

const { ApiError, err } = require('../core/errors');

function requireAuth(ctx) {
  if (!ctx.user || !ctx.user.userId) {
    throw new ApiError(4010, '未登录或登录已失效', 401);
  }
  return ctx.user;
}

/** H5 运维：JWT role=admin */
function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (user.role !== 'admin') {
    throw err('FORBIDDEN', { message: '需要管理员权限' });
  }
  return user;
}

function getRepos() {
  return require('../repositories').getRepos();
}

async function requireGroupMember(ctx, groupId) {
  const repos = getRepos();
  const member = await repos.groups.getMember(groupId, ctx.user.userId);
  if (!member || member.status !== 'active') throw err('FORBIDDEN', { message: '你不是该分组成员' });
  return member;
}

async function requireGroupPublisher(ctx, groupId) {
  const member = await requireGroupMember(ctx, groupId);
  if (member.roleInGroup !== 'publisher') throw err('NOT_GROUP_PUBLISHER');
  return member;
}

async function requireTask(ctx, taskId) {
  const repos = getRepos();
  const task = await repos.tasks.getById(taskId);
  if (!task) throw err('TASK_NOT_FOUND');
  return task;
}

async function requireTaskPublisher(ctx, taskId) {
  const task = await requireTask(ctx, taskId);
  if (task.publisherId !== ctx.user.userId) throw err('TASK_NOT_PUBLISHER');
  return task;
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireGroupMember,
  requireGroupPublisher,
  requireTask,
  requireTaskPublisher,
};
