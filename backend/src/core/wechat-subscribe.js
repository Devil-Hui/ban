'use strict';

/**
 * 微信小程序：access_token + 订阅消息下发。
 * - 无 appid/secret 时静默跳过（本地 dev openid 无法真发）
 * - 可通过 setSubscribeSender 注入桩，单测不打外网
 */

const config = require('../config');

let cachedToken = null;
let cachedExpireAt = 0;
let subscribeSender = null;

function setSubscribeSender(fn) {
  subscribeSender = fn;
}

function clearTokenCache() {
  cachedToken = null;
  cachedExpireAt = 0;
}

async function getAccessToken() {
  if (!config.wechat.appid || !config.wechat.secret) return null;
  const now = Date.now();
  if (cachedToken && cachedExpireAt > now + 60 * 1000) return cachedToken;

  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    encodeURIComponent(config.wechat.appid) +
    '&secret=' +
    encodeURIComponent(config.wechat.secret);
  const res = await fetch(url);
  const json = await res.json();
  if (!json.access_token) {
    const err = new Error('wx access_token failed: ' + JSON.stringify(json));
    err.wx = json;
    throw err;
  }
  cachedToken = json.access_token;
  cachedExpireAt = now + (Number(json.expires_in) || 7200) * 1000;
  return cachedToken;
}

/**
 * 下发一次性订阅消息
 * @param {{ touser: string, templateId: string, data: object, page?: string, miniprogramState?: string }} opts
 */
async function sendSubscribeMessage(opts) {
  const { touser, templateId, data, page, miniprogramState } = opts || {};
  if (!touser || !templateId || !data) {
    return { ok: false, skipped: true, reason: 'missing_params' };
  }

  if (subscribeSender) {
    return subscribeSender({ touser, templateId, data, page, miniprogramState });
  }

  if (!config.wechat.appid || !config.wechat.secret) {
    return { ok: false, skipped: true, reason: 'no_wechat_credentials' };
  }

  const token = await getAccessToken();
  if (!token) return { ok: false, skipped: true, reason: 'no_token' };

  const url =
    'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' +
    encodeURIComponent(token);
  const body = {
    touser,
    template_id: templateId,
    page: page || 'pages/index/index',
    miniprogram_state: miniprogramState || process.env.WX_MINI_STATE || 'formal',
    lang: 'zh_CN',
    data,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.errcode && json.errcode !== 0) {
    // 40001 token 失效时清缓存，便于下次重试
    if (json.errcode === 40001 || json.errcode === 42001) clearTokenCache();
    return { ok: false, skipped: false, errcode: json.errcode, errmsg: json.errmsg, raw: json };
  }
  return { ok: true, raw: json };
}

module.exports = {
  getAccessToken,
  sendSubscribeMessage,
  setSubscribeSender,
  clearTokenCache,
};
