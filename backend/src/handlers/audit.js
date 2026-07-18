'use strict';

/**
 * 审计日志：写关键运营操作，供 H5 只读查询。
 * 约定：失败不影响主业务（best-effort）。
 */

async function writeAudit(repos, ctx, entry) {
  try {
    if (!repos || !repos.audits || !repos.audits.write) return null;
    const operatorId =
      (ctx && ctx.user && (ctx.user.userId != null ? ctx.user.userId : ctx.user.id)) || null;
    return await repos.audits.write({
      operatorId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      action: entry.action,
      beforeValue: entry.beforeValue != null ? entry.beforeValue : null,
      afterValue: entry.afterValue != null ? entry.afterValue : null,
      reason: entry.reason || null,
      ipAddress: (ctx && ctx.headers && (ctx.headers['x-forwarded-for'] || ctx.headers['x-real-ip'])) || null,
      requestId: (ctx && ctx.requestId) || null,
    });
  } catch (_) {
    return null;
  }
}

/** GET /api/v1/admin/audit-logs */
async function listAuditLogs(ctx) {
  const { requireAdmin } = require('./guard');
  const { optional } = require('../core/validate');
  const config = require('../config');
  requireAdmin(ctx);
  const q = optional(ctx.query || {}, {
    page: { type: 'int', default: 1, min: 1 },
    pageSize: { type: 'int', default: config.defaultPageSize, min: 1, max: config.maxPageSize },
    action: { type: 'string', default: null },
    targetType: { type: 'string', default: null },
  });
  const repos = require('../repositories').getRepos();
  if (!repos.audits || !repos.audits.list) {
    return { list: [], total: 0, page: q.page, pageSize: q.pageSize };
  }
  return repos.audits.list(q);
}

module.exports = { writeAudit, listAuditLogs };
