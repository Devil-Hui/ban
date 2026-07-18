'use strict';

/**
 * 鉴权模块（区分小程序 / H5 两端）。
 * - 小程序端：wx.login 拿 code → 换 openid → 签发 JWT
 * - H5 运维端：账号密码登录 → 签发带 admin 角色的 JWT
 * 返回 { accessToken, refreshToken, tokenType, expiresIn }
 */

const { signToken, exchangeCodeForOpenid, verifyToken } = require('../core/auth');
const { err } = require('../core/errors');
const { required } = require('../core/validate');
const config = require('../config');

function parseExpiresIn(e) {
  const m = /^(\d+)([smhd])$/.exec(e || '');
  if (!m) return 7200;
  return parseInt(m[1], 10) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
}

function issueTokens(userId, role) {
  const access = signToken({ userId, role }, config.jwt.accessExpire);
  const refresh = signToken({ userId, role, typ: 'refresh' }, config.jwt.refreshExpire);
  return {
    accessToken: access,
    refreshToken: refresh,
    tokenType: 'Bearer',
    expiresIn: parseExpiresIn(config.jwt.accessExpire),
  };
}

/** POST /api/v1/auth/miniprogram/login
 * 逻辑链：code → openid → upsert users → 签发 JWT
 * 数据链：users(openid) UPSERT；返回 token + 脱敏 user，前端可直接落 globalData
 */
async function miniprogramLogin(ctx) {
  const { code } = required(ctx.body, { code: { type: 'string', label: 'code' } });
  const openid = await exchangeCodeForOpenid(code);
  const repos = require('../repositories').getRepos();
  const user = await repos.users.upsertByOpenid(openid, {
    nickname: ctx.body.nickname,
    avatarUrl: ctx.body.avatarUrl,
  });
  if (user.isBanned === 1 || user.isBanned === true) {
    throw err('FORBIDDEN', { message: '账号已被封禁' });
  }
  const tokens = issueTokens(user.id, 'user');
  return Object.assign({}, tokens, {
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || '',
      role: 'user',
    },
  });
}

/** POST /api/v1/auth/h5/login */
async function h5Login(ctx) {
  const { username, password } = required(ctx.body, {
    username: { type: 'string', label: 'username' },
    password: { type: 'string', label: 'password' },
  });
  if (username !== config.h5.adminUsername || password !== config.h5.adminPassword) {
    throw err('UNAUTHORIZED', { message: '账号或密码错误' });
  }
  const tokens = issueTokens('admin', 'admin');
  return Object.assign({}, tokens, {
    user: { id: 'admin', username, role: 'admin', nickname: '管理员' },
  });
}

/** POST /api/v1/auth/refresh */
async function refresh(ctx) {
  const { refreshToken } = required(ctx.body, { refreshToken: { type: 'string', label: 'refreshToken' } });
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch (e) {
    throw err('TOKEN_EXPIRED');
  }
  if (payload.typ !== 'refresh') throw err('TOKEN_INVALID', { message: 'refreshToken 非法' });
  return issueTokens(payload.userId, payload.role);
}

module.exports = { miniprogramLogin, h5Login, refresh, issueTokens };
