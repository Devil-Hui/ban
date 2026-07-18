'use strict';

/**
 * 消息模块：订阅模板配置、授权记录、消息中心（红点兜底）、已读。
 *
 * 双轨通知（不依赖真实微信模板也能跑通主链）：
 *  1) 站内 inbox：发布/截止 worker 必写（始终可用）
 *  2) 微信订阅消息：仅当 WX_TMPL_* 配置了真实模板 ID 时，前端才调 wx.requestSubscribeMessage
 */

const { required, optional } = require('../core/validate');
const { err } = require('../core/errors');
const { requireAuth } = require('./guard');
const config = require('../config');

function templateCatalog() {
  const pub = (config.subscribeTemplates && config.subscribeTemplates.taskPublished) || '';
  const dead = (config.subscribeTemplates && config.subscribeTemplates.deadlineRemind) || '';
  const items = [
    {
      key: 'task_published',
      label: '排班发布通知',
      templateId: pub,
      enabled: !!pub,
      scene: 'publish',
    },
    {
      key: 'deadline_remind',
      label: '填报截止提醒',
      templateId: dead,
      enabled: !!dead,
      scene: 'deadline',
    },
  ];
  const wxReadyIds = items.filter((i) => i.enabled).map((i) => i.templateId);
  return {
    items,
    wxReadyIds,
    wxSubscribeEnabled: wxReadyIds.length > 0,
    /** 无真实模板时仍可订阅「逻辑偏好」，仅影响产品侧记录，不调微信 */
    logicalKeys: items.map((i) => i.key),
    mode: wxReadyIds.length ? 'wechat_subscribe' : 'inbox_only',
  };
}

/** GET /api/v1/meta/notify-templates — 前端启动拉配置（可不登录） */
async function getTemplates(ctx) {
  return templateCatalog();
}

/** POST /api/v1/notify/subscribe */
async function subscribe(ctx) {
  const user = requireAuth(ctx);
  const body = ctx.body || {};
  // 兼容：templateIds（微信真实 ID）或 keys（逻辑键 task_published / deadline_remind）
  let templateIds = Array.isArray(body.templateIds) ? body.templateIds.filter(Boolean) : [];
  let keys = Array.isArray(body.keys) ? body.keys.filter(Boolean) : [];
  const catalog = templateCatalog();

  if (!templateIds.length && !keys.length) {
    // 默认订阅全部逻辑键（开发/inbox_only 模式）
    keys = catalog.logicalKeys.slice();
  }

  // 把逻辑键映射到已配置的真实模板 ID
  if (keys.length) {
    for (const k of keys) {
      const hit = catalog.items.find((i) => i.key === k);
      if (hit && hit.templateId && templateIds.indexOf(hit.templateId) < 0) {
        templateIds.push(hit.templateId);
      }
    }
  }

  const accepted = Array.isArray(body.accepted)
    ? body.accepted
    : keys.length
      ? keys.slice()
      : templateIds.slice();

  if (!templateIds.length && !keys.length && !accepted.length) {
    throw err('NOTIFY_SUBSCRIBE_FAILED', { message: '请至少选择一个订阅模板' });
  }

  const repos = require('../repositories').getRepos();
  if (repos.subscriptions && repos.subscriptions.upsert) {
    await repos.subscriptions.upsert(user.userId, {
      templateIds: templateIds.length ? templateIds : keys,
      accepted,
      keys: keys.length ? keys : accepted,
      mode: catalog.mode,
    });
  }

  return {
    accepted,
    templateIds,
    keys: keys.length ? keys : accepted,
    configured: {
      taskPublished: !!(config.subscribeTemplates && config.subscribeTemplates.taskPublished),
      deadlineRemind: !!(config.subscribeTemplates && config.subscribeTemplates.deadlineRemind),
    },
    mode: catalog.mode,
    wxSubscribeEnabled: catalog.wxSubscribeEnabled,
  };
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

module.exports = { subscribe, listInbox, readInbox, getTemplates, templateCatalog };
