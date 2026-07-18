// services/notify.js — 消息中心与订阅消息（双轨：微信模板 / 站内 inbox）
const { get, post, patch } = require('../utils/request');
const config = require('../utils/config');

let _catalogCache = null;
let _catalogAt = 0;

/** 拉后端模板目录（缓存 5 分钟） */
async function getTemplates(force) {
  const now = Date.now();
  if (!force && _catalogCache && now - _catalogAt < 5 * 60 * 1000) {
    return _catalogCache;
  }
  try {
    const res = await get('/meta/notify-templates', null, { auth: false, silent: true });
    _catalogCache = res || { items: [], wxReadyIds: [], mode: 'inbox_only' };
    _catalogAt = now;
    return _catalogCache;
  } catch (_) {
    // 离线：用本地 config
    const local = localCatalog();
    _catalogCache = local;
    _catalogAt = now;
    return local;
  }
}

function localCatalog() {
  const m = config.subscribeTemplateIds || {};
  const pub = m.taskPublished || '';
  const dead = m.deadlineRemind || '';
  const items = [
    { key: 'task_published', label: '排班发布通知', templateId: pub, enabled: !!pub },
    { key: 'deadline_remind', label: '填报截止提醒', templateId: dead, enabled: !!dead },
  ];
  const wxReadyIds = items.filter((i) => i.enabled).map((i) => i.templateId);
  return {
    items,
    wxReadyIds,
    wxSubscribeEnabled: wxReadyIds.length > 0,
    logicalKeys: items.map((i) => i.key),
    mode: wxReadyIds.length ? 'wechat_subscribe' : 'inbox_only',
  };
}

/**
 * 请求订阅（必须由用户点击触发）。
 * - 有真实微信模板 ID：调 wx.requestSubscribeMessage + 上报
 * - 无真实 ID（inbox_only）：只上报逻辑键偏好，不弹微信窗，不打断主链
 *
 * @param {object} [opts]
 * @param {string} [opts.scene] publish | deadline | all
 * @param {string[]} [opts.tmplIds] 强制指定微信模板 ID
 * @param {string[]} [opts.keys] 逻辑键
 */
async function subscribe(opts) {
  const o = opts || {};
  const catalog = await getTemplates().catch(() => localCatalog());
  let keys = o.keys;
  if (!keys || !keys.length) {
    if (o.scene === 'publish') keys = ['task_published'];
    else if (o.scene === 'deadline') keys = ['deadline_remind'];
    else keys = catalog.logicalKeys || ['task_published', 'deadline_remind'];
  }

  // 解析微信真实 ID：优先 opts.tmplIds → catalog 映射 → 本地 config
  let ids = (o.tmplIds || []).filter(Boolean);
  if (!ids.length) {
    ids = (catalog.items || [])
      .filter((i) => keys.indexOf(i.key) >= 0 && i.templateId)
      .map((i) => i.templateId);
  }
  if (!ids.length && typeof config.getSubscribeTmplList === 'function') {
    ids = config.getSubscribeTmplList().filter(Boolean);
  }
  ids = ids.filter((id) => id && String(id).indexOf('TEMPLATE_ID_') !== 0 && String(id).trim());

  // —— inbox_only：不调微信，仍记录偏好 ——
  if (!ids.length) {
    try {
      await post(
        '/notify/subscribe',
        { keys, accepted: keys, templateIds: [] },
        { silent: true }
      );
    } catch (_) {}
    return {
      accepted: keys,
      skipped: true,
      mode: 'inbox_only',
      message: '已开启站内提醒（未配置微信模板 ID，不弹系统订阅）',
    };
  }

  // —— 有真实模板：调微信 ——
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      complete: (res) => {
        const accepted = ids.filter((id) => res && res[id] === 'accept');
        const rejected = ids.filter((id) => res && res[id] && res[id] !== 'accept');
        post(
          '/notify/subscribe',
          { templateIds: ids, accepted, keys },
          { silent: true }
        ).catch(() => {});
        resolve({
          accepted,
          rejected,
          result: res || {},
          mode: 'wechat_subscribe',
          skipped: false,
        });
      },
    });
  });
}

const listInbox = async (params) => {
  const res = await get('/users/me/inbox', params || { page: 1, pageSize: 20 });
  if (!res) return { items: [], unreadCount: 0 };
  const items = res.list || res.items || [];
  const unread = res.unread != null ? res.unread : res.unreadCount || 0;
  return {
    items: items.map((m) =>
      Object.assign({}, m, {
        read: m.read != null ? m.read : !!m.isRead,
        body: m.body || m.content || '',
        title: m.title || '通知',
        timeText: formatMsgTime(m.createdAt || m.created_at),
      })
    ),
    unreadCount: unread,
  };
};

function formatMsgTime(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length >= 16) return s.slice(5, 16).replace('T', ' ');
  return s;
}

const readInbox = (messageId) => patch(`/users/me/inbox/${messageId}`, { read: true });

module.exports = { subscribe, listInbox, readInbox, getTemplates };