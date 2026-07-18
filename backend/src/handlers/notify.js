'use strict';

/**
 * 消息模块：订阅消息授权记录、消息中心（红点兜底）、已读。
 * 端差异：小程序端订阅通过 wx.requestSubscribeMessage（客户端），服务端仅记录受理结果；
 *         H5 端无订阅消息能力，统一走消息中心轮询/红点。
 */

const { required, optional } = require('../core/validate');
const { err } = require('../core/errors');
const { requireAuth } = require('./guard');
const config = require('../config');

/** POST /api/v1/notify/subscribe */
async function subscribe(ctx) {
  const user = requireAuth(ctx);
  const { templateIds } = required(ctx.body, { templateIds: { type: 'array', label: 'templateIds' } });
  if (!templateIds.length) throw err('NOTIFY_SUBSCRIBE_FAILED', { message: '请至少选择一个订阅模板' });
  // 真实场景：小程序端已在前端调用 wx.requestSubscribeMessage 拿到用户授权，
  // 此处仅持久化受理结果（accepted 来自客户端回传或默认全收）。
  const accepted = ctx.body.accepted || templateIds;
  return { accepted, templateIds };
}

/** GET /api/v1/users/me/inbox */
async function listInbox(ctx) {
  const user = requireAuth(ctx);
  const q = optional(ctx.query, {
    page: { type: 'int', default: 1, min: 1 },
    pageSize: { type: 'int', default: config.defaultPageSize, min: 1, max: config.maxPageSize },
  });
  const repos = require('../repositories').getRepos();
  const result = await repos.notify.listInbox(user.userId, q);
  const unread = await repos.notify.countUnread(user.userId);
  return Object.assign(result, { unread });
}

/** PATCH /api/v1/users/me/inbox/{message_id} */
async function readInbox(ctx) {
  const user = requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  const msg = await repos.notify.markRead(user.userId, ctx.params.messageId);
  if (!msg) throw err('NOT_FOUND', { message: '消息不存在' });
  return { message: msg };
}

module.exports = { subscribe, listInbox, readInbox };
