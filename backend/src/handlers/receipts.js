'use strict';

/** 回执/异议模块：成员对排班提出异议，发布者处理后标记 resolved。 */

const { err } = require('../core/errors');
const { requireAuth, requireTask } = require('./guard');

/** POST /api/v1/tasks/{task_id}/receipts/me/objection */
async function objection(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTask(ctx, ctx.params.taskId);
  const repos = require('../repositories').getRepos();
  const member = await repos.groups.getMember(task.groupId, user.userId);
  if (!member || member.status !== 'active') throw err('FORBIDDEN');
  if (task.status !== 'published') throw err('TASK_STATUS_INVALID', { message: '仅发布后的排班可提异议' });
  // 兼容 content / reason / objectionReason
  const raw =
    (ctx.body && (ctx.body.objectionReason || ctx.body.content || ctx.body.reason)) || '';
  const objectionReason = String(raw).trim().slice(0, 200);
  if (!objectionReason) {
    throw err('VALIDATION_ERROR', { message: '请填写异议原因' });
  }
  const receipt = await repos.receipts.upsert({
    taskId: task.id,
    userId: user.userId,
    receiptStatus: 'objection',
    objectionReason,
  });
  return { receipt };
}

/** GET /api/v1/tasks/{task_id}/receipts/me */
async function getMine(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTask(ctx, ctx.params.taskId);
  const repos = require('../repositories').getRepos();
  const receipt = await repos.receipts.get(task.id, user.userId);
  if (!receipt) throw err('NOT_FOUND', { message: '暂无回执' });
  return { receipt };
}

module.exports = { objection, getMine };
