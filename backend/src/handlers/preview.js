'use strict';

/**
 * 分享预览模块（公开只读）。
 * 凭 share_token 查看脱敏排班；校验过期；不返回手机号等敏感字段。
 */

const { err } = require('../core/errors');

function maskName(name) {
  const s = String(name || '').trim();
  if (!s) return '成员';
  if (s.length === 1) return s;
  if (s.length === 2) return s[0] + '*';
  return s[0] + '*'.repeat(Math.min(s.length - 2, 2)) + s[s.length - 1];
}

/** GET /api/v1/share/tasks/{task_id}?token=xxx */
async function getShared(ctx) {
  const token = (ctx.query && (ctx.query.token || ctx.query.shareToken)) || '';
  if (!token) throw err('PREVIEW_TOKEN_INVALID');

  const repos = require('../repositories').getRepos();
  const task = await repos.tasks.getByShareToken(token);
  if (!task) throw err('PREVIEW_TOKEN_INVALID');
  if (task.expired) throw err('PREVIEW_TOKEN_EXPIRED');

  // 路径 taskId 若带上，必须与 token 对应任务一致（防枚举）
  const pathId = ctx.params && (ctx.params.taskId || ctx.params.id);
  if (pathId != null && String(pathId) !== String(task.id)) {
    throw err('PREVIEW_TOKEN_INVALID', { message: '预览链接与任务不匹配' });
  }

  const finalSchedule = task.finalSchedule || {};
  const rawAssign = finalSchedule.assignments || [];
  const assignments = rawAssign.map((a) => {
    const names = a.userNames || a.names || [];
    const masked = names.map(maskName);
    // 兼容 userIds：只返回人数，不返回 id
    const count =
      masked.length ||
      (Array.isArray(a.userIds) ? a.userIds.length : 0) ||
      (a.userId ? 1 : 0);
    return {
      date: a.date || null,
      periodId: a.periodId || a.period || null,
      periodName: a.periodName || a.label || a.periodId || '',
      userNames: masked,
      assigneeCount: count,
    };
  });

  const periods = Array.isArray(task.periods)
    ? task.periods.map((p) => ({
        id: p.id,
        name: p.name || p.label || '',
        start: p.start || '',
        end: p.end || '',
      }))
    : [];

  return {
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      timeMode: task.timeMode || null,
      dateRangeStart: task.dateRangeStart || null,
      dateRangeEnd: task.dateRangeEnd || null,
      publishedAt: task.publishedAt || null,
      periods,
      schedule: {
        schemeName: finalSchedule.schemeName || '排班方案',
        assignments,
      },
    },
    meta: {
      desensitized: true,
      expiresAt: task.shareTokenExpiresAt || null,
    },
  };
}

module.exports = { getShared, maskName };
