'use strict';

/**
 * 鉴权与登录。
 * 区分两类客户端：
 *  - 小程序端(miniprogram)：wx.login 拿 code → 换 openid → 签发 JWT（access+refresh）
 *  - H5 运维端(h5)：账号密码登录 → 签发 JWT（带 admin 角色）
 * 不依赖第三方 JWT 库，使用 Node crypto 实现 HS256，零外部依赖。
 */

const crypto = require('crypto');
const config = require('../config');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}
function signHS256(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function parsePayload(seg) {
  return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

/** 签发 JWT（access / refresh） */
function signToken(payload, expiresIn, secret = config.jwt.secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpire(expiresIn);
  const body = Object.assign({ iat: now, exp }, payload);
  const data = b64urlJson(header) + '.' + b64urlJson(body);
  return data + '.' + signHS256(data, secret);
}

function parseExpire(expireIn) {
  if (typeof expireIn === 'number') return expireIn;
  const m = /^(\d+)([smhd])$/.exec(expireIn || '');
  if (!m) return 7200;
  const n = parseInt(m[1], 10);
  const map = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * map[m[2]];
}

/** 校验 JWT，返回 payload；过期/签名错误抛错 */
function verifyToken(token, secret = config.jwt.secret) {
  if (!token || typeof token !== 'string') throw new Error('empty');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const data = parts[0] + '.' + parts[1];
  const sig = signHS256(data, secret);
  // 防时序攻击
  if (sig.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[2]))) {
    throw new Error('bad signature');
  }
  const payload = parsePayload(parts[1]);
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
  return payload;
}

/**
 * 调用微信接口，用 code 换取 openid（生产环境）。
 * 测试/本地可通过 auth.setWxLoginVerifier 注入桩函数，避免真实网络依赖。
 */
let wxLoginVerifier = null;
function setWxLoginVerifier(fn) {
  wxLoginVerifier = fn;
}

async function exchangeCodeForOpenid(code) {
  if (wxLoginVerifier) return wxLoginVerifier(code);
  if (!config.wechat.appid || !config.wechat.secret) {
    // 本地无配置时返回可逆的假 openid，便于开发联调
    return 'dev_openid_' + crypto.createHash('md5').update(code).digest('hex').slice(0, 16);
  }
  const url =
    'https://api.weixin.qq.com/sns/jscode2session?appid=' +
    config.wechat.appid +
    '&secret=' +
    config.wechat.secret +
    '&js_code=' +
    encodeURIComponent(code) +
    '&grant_type=authorization_code';
  const res = await fetch(url);
  const json = await res.json();
  if (!json.openid) throw new Error('wx login failed: ' + JSON.stringify(json));
  return json.openid;
}

module.exports = {
  signToken,
  verifyToken,
  exchangeCodeForOpenid,
  setWxLoginVerifier,
};
