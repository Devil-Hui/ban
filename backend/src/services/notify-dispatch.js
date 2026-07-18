'use strict';

/**
 * 通知分发：站内 inbox（必达）+ 微信订阅消息（有模板/openid/授权时尽力发送）。
 *
 * 模板字段：公共库字段名因模板而异。这里用常见 thing/time/phrase 组合；
 * 若公众平台字段不一致，可在 data 覆盖或改 buildWxData。
 */

const config = require('../config');
const { sendSubscribeMessage } = require('../core/wechat-subscribe');

const KEY_TO_CONFIG = {
  task_published: 'taskPublished',
  group_joined: 'groupJoined',
  deadline_remind: 'deadlineRemind',
  deadline_closed: 'deadlineRemind',
};

function resolveTemplateId(logicalKey) {
  const st = config.subscribeTemplates || {};
  const confKey = KEY_TO_CONFIG[logicalKey] || logicalKey;
  let id = st[confKey] || '';
  if (!id && logicalKey === 'group_joined') id = st.taskPublished || '';
  if (!id && logicalKey === 'deadline_closed') id = st.deadlineRemind || '';
  return id;
}

function clip(s, n) {
  const t = String(s == null ? '' : s);
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + '…';
}

/**
 * 构造微信 data（按常见订阅模板字段；可被 payload.wxData 覆盖）
 */
function buildWxData(logicalKey, payload = {}) {
  if (payload.wxData && typeof payload.wxData === 'object') return payload.wxData;

  const title = clip(payload.title || '排班通知', 20);
  const body = clip(payload.body || '', 20);
  const groupName = clip(payload.groupName || payload.thing2 || '排班分组', 20);
  const taskTitle = clip(payload.taskTitle || payload.thing1 || title, 20);
  const timeStr = clip(
    payload.time ||
      payload.deadline ||
      new Date().toISOString().slice(0, 16).replace('T', ' '),
    20
  );
  const status = clip(payload.statusText || '请查看', 20);

  // 字段按常见公共库命名；可用 extra.wxData 完全覆盖
  // 排班加入通知 / 未提交日志：优先 thing + time 组合
  const data = {
    thing1: { value: taskTitle },
    thing2: { value: groupName },
    thing3: { value: body || status },
    time1: { value: timeStr },
    time2: { value: timeStr },
    phrase1: { value: status },
  };
  if (logicalKey === 'deadline_remind' || logicalKey === 'deadline_closed') {
    return {
      thing1: { value: taskTitle },
      thing2: { value: clip(payload.body || '请尽快提交空闲', 20) },
      time1: { value: timeStr },
      time2: { value: timeStr },
      phrase1: { value: clip(payload.statusText || '待提交', 20) },
    };
  }
  if (logicalKey === 'group_joined') {
    return {
      thing1: { value: groupName },
      thing2: { value: clip(payload.body || '欢迎加入', 20) },
      time1: { value: timeStr },
      phrase1: { value: '已加入' },
    };
  }
  if (logicalKey === 'task_published') {
    return {
      thing1: { value: taskTitle },
      thing2: { value: groupName },
      thing3: { value: clip(payload.body || '排班已发布，请查看', 20) },
      time1: { value: timeStr },
      phrase1: { value: '已发布' },
    };
  }
  return data;
}

function pageFor(logicalKey, payload = {}) {
  if (payload.page) return payload.page;
  if (payload.taskId) return `pages/task-detail/task-detail?id=${payload.taskId}`;
  if (payload.groupId) return `pages/group-detail/group-detail?id=${payload.groupId}`;
  return 'pages/index/index';
}

/**
 * 用户是否接受过该模板（或逻辑键）
 */
async function userAccepted(repos, userId, templateId, logicalKey) {
  if (!repos.subscriptions || !repos.subscriptions.get) return true; // 无记录时不拦截下发尝试
  const sub = await repos.subscriptions.get(userId);
  if (!sub) return false;
  const accepted = sub.accepted || [];
  if (!accepted.length) return false;
  if (templateId && accepted.indexOf(templateId) >= 0) return true;
  if (logicalKey && accepted.indexOf(logicalKey) >= 0) return true;
  // 接受过任一相关模板 ID
  const ids = sub.templateIds || [];
  if (templateId && ids.indexOf(templateId) >= 0 && accepted.length) {
    // 若 accepted 是微信 accept 的 id 列表
    return accepted.some((a) => a === templateId || a === 'accept');
  }
  return accepted.length > 0 && !templateId;
}

/**
 * 给单个用户发站内 + 尝试微信
 */
async function notifyUser(repos, { userId, logicalKey, title, body, taskId, groupId, groupName, taskTitle, extra }) {
  const payload = Object.assign(
    {
      title,
      body,
      taskId: taskId || null,
      groupId: groupId || null,
      groupName,
      taskTitle,
    },
    extra || {}
  );

  let inbox = null;
  if (repos.notify && repos.notify.enqueue) {
    inbox = await repos.notify.enqueue({
      userId,
      taskId: taskId || null,
      templateId: logicalKey,
      title: title || '通知',
      body: body || '',
    });
  }

  const templateId = resolveTemplateId(logicalKey);
  let wxResult = { ok: false, skipped: true, reason: 'no_template' };
  if (templateId) {
    const user = await repos.users.getById(userId);
    const openid = user && user.openid;
    if (!openid || String(openid).startsWith('dev_openid_')) {
      wxResult = { ok: false, skipped: true, reason: 'no_real_openid' };
    } else {
      const okAuth = await userAccepted(repos, userId, templateId, logicalKey);
      if (!okAuth) {
        wxResult = { ok: false, skipped: true, reason: 'not_subscribed' };
      } else {
        try {
          wxResult = await sendSubscribeMessage({
            touser: openid,
            templateId,
            data: buildWxData(logicalKey, payload),
            page: pageFor(logicalKey, payload),
          });
        } catch (e) {
          wxResult = {
            ok: false,
            skipped: false,
            reason: 'send_error',
            message: e && e.message,
          };
        }
      }
    }
  }

  return { inbox, wx: wxResult, templateId };
}

/**
 * 通知分组成员
 */
async function notifyGroupMembers(repos, { groupId, logicalKey, title, body, taskId, taskTitle, excludeUserId }) {
  const members = await repos.groups.listMembers(groupId);
  const group = await repos.groups.getById(groupId);
  const groupName = (group && group.name) || '';
  const results = [];
  for (const m of members) {
    if (m.status && m.status !== 'active') continue;
    if (excludeUserId != null && String(m.userId) === String(excludeUserId)) continue;
    const r = await notifyUser(repos, {
      userId: m.userId,
      logicalKey,
      title,
      body,
      taskId,
      groupId,
      groupName,
      taskTitle,
    });
    results.push({ userId: m.userId, ...r });
  }
  return results;
}

module.exports = {
  notifyUser,
  notifyGroupMembers,
  buildWxData,
  resolveTemplateId,
  pageFor,
};
