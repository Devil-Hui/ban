// services/notify.js — 消息中心与订阅消息
const { get, post, patch } = require('../utils/request');

/**
 * 请求一次性订阅消息授权（必须由用户点击触发）。
 * 未配置真实模板 ID（仍为 TEMPLATE_ID_* 占位）时跳过，避免开发期报错打断主链。
 */
const subscribe = (tmplIds) => {
  const ids = (tmplIds || []).filter((id) => id && String(id).indexOf('TEMPLATE_ID_') !== 0);
  if (!ids.length) return Promise.resolve({ accepted: [], skipped: true });
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      complete: (res) => {
        const accepted = ids.filter((id) => res && res[id] === 'accept');
        post('/notify/subscribe', { templateIds: ids, accepted }, { silent: true }).catch(() => {});
        resolve({ accepted, result: res || {} });
      },
    });
  });
};

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
      })
    ),
    unreadCount: unread,
  };
};

const readInbox = (messageId) => patch(`/users/me/inbox/${messageId}`, { read: true });

module.exports = { subscribe, listInbox, readInbox };
