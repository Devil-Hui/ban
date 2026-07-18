'use strict';

/** 空闲标记模块：成员提交/查看自己的空闲时间（标记阶段彼此不可见）。 */

const { err } = require('../core/errors');
const { requireAuth, requireTask } = require('./guard');

/**
 * 归一化空闲标记：兼容前端 availability[{date,slots}] 与后端 availableSlots。
 * 数据链统一写入 availableSlots（数组或结构化，仓储原样保存）。
 */
function normalizeSlots(body) {
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body.availableSlots)) return body.availableSlots;
  if (Array.isArray(body.availability)) {
    // 前端芯片选择结构 → 扁平化 [{date, periodId/slot}] 或保留结构化
    return body.availability
      .map((a) => ({
        date: a.date,
        slots: a.slots || a.periodIds || [],
      }))
      .filter((a) => a.date && a.slots && a.slots.length > 0);
  }
  return null;
}

/** PUT /api/v1/tasks/{task_id}/responses/me
 * 按钮链：成员点「提交/更新我的时间」
 * 逻辑链：鉴权 → 组员 active → status=collecting → UPSERT 本人标记
 * 隐私：仅写本人行，标记阶段接口不返回他人
 */
async function submit(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTask(ctx, ctx.params.taskId);
  const repos = require('../repositories').getRepos();
  const member = await repos.groups.getMember(task.groupId, user.userId);
  if (!member || member.status !== 'active') throw err('FORBIDDEN', { message: '你不是该分组成员' });
  if (task.status !== 'collecting') throw err('RESPONSE_NOT_COLLECTING');
  const availableSlots = normalizeSlots(ctx.body);
  if (!availableSlots || availableSlots.length === 0) {
    throw err('VALIDATION_ERROR', { message: '请至少选择一个空闲时段' });
  }
  const response = await repos.responses.upsert({
    taskId: task.id,
    userId: user.userId,
    availableSlots,
    source: (ctx.body && ctx.body.source) || 'manual',
  });
  return { response };
}

/** GET /api/v1/tasks/{task_id}/responses/me */
async function getMine(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTask(ctx, ctx.params.taskId);
  const repos = require('../repositories').getRepos();
  const response = await repos.responses.get(task.id, user.userId);
  if (!response) throw err('NOT_FOUND', { message: '你尚未提交空闲时间' });
  // 兼容前端读取 availability 字段
  const payload = Object.assign({}, response, {
    availability: response.availability || response.availableSlots || [],
  });
  return { response: payload };
}

module.exports = { submit, getMine };
