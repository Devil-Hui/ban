'use strict';

/**
 * 分享预览模块（H5 公开只读页）。
 * 非小程序用户（浏览器/QQ）凭 share_token 查看脱敏排班，默认 7 天有效。
 * 端差异：小程序端通过 onShareAppMessage 直接打开小程序内预览页（带登录态）；
 * H5 端通过 URL + token 只读访问，姓名可见、手机号脱敏、无登录态。
 */

const { err } = require('../core/errors');

/** GET /api/v1/share/tasks/{task_id}?token=xxx */
async function getShared(ctx) {
  const { token } = ctx.query;
  const repos = require('../repositories').getRepos();
  const task = await repos.tasks.getByShareToken(token);
  if (!task) throw err('PREVIEW_TOKEN_INVALID');
  if (task.expired) throw err('PREVIEW_TOKEN_EXPIRED');

  // 脱敏：姓名保留，手机号脱敏（未存明文手机号时直接返回姓名）
  const finalSchedule = task.finalSchedule || {};
  const assignments = (finalSchedule.assignments || []).map((a) => ({
    date: a.date,
    periodId: a.periodId,
    periodName: a.periodName,
    userNames: a.userNames || [],
  }));
  return {
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      publishedAt: task.publishedAt,
      schedule: { schemeName: finalSchedule.schemeName || '排班方案', assignments },
    },
  };
}

module.exports = { getShared };
