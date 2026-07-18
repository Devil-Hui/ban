'use strict';

/**
 * 截止调度：根据任务 deadline 生成 reminder + deadline 两条 countdown。
 * 与仓储无关，便于单测。
 */

/**
 * @param {string|Date|null} deadline
 * @param {{ reminderHours?: number, now?: number }} opts
 * @returns {{ type: 'reminder'|'deadline', triggerAt: string }[]}
 */
function buildCountdownPlan(deadline, opts = {}) {
  if (!deadline) return [];
  const reminderHours = opts.reminderHours != null ? opts.reminderHours : 24;
  const now = opts.now != null ? opts.now : Date.now();
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return [];

  const plan = [];
  const remindAt = end - reminderHours * 3600 * 1000;
  // 仅当提醒点仍在未来，且早于截止时写入
  if (remindAt > now && remindAt < end) {
    plan.push({ type: 'reminder', triggerAt: new Date(remindAt).toISOString() });
  }
  if (end > now) {
    plan.push({ type: 'deadline', triggerAt: new Date(end).toISOString() });
  }
  return plan;
}

/**
 * 处理到期 countdown 的纯逻辑（状态机）：返回对任务应执行的动作。
 * @returns {'noop'|'to_reviewing'}
 */
function actionForCountdown(type, taskStatus) {
  if (type === 'deadline' && taskStatus === 'collecting') return 'to_reviewing';
  return 'noop';
}

module.exports = { buildCountdownPlan, actionForCountdown };
