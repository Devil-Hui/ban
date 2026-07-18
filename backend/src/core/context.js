'use strict';

/**
 * 将请求适配为统一的 ctx 上下文对象，使处理器框架无关。
 * 处理器签名统一为：async (ctx) => data
 * ctx = { params, query, body, headers, clientType, user, requestId }
 *  - clientType: 'miniprogram' | 'h5'（由请求头 X-Client-Type 决定，默认 miniprogram）
 *  - user: 已鉴权用户对象（来自 Authorization 头），未登录为 null
 */

const { verifyToken } = require('./auth');
const { UNAUTHORIZED, TOKEN_EXPIRED, TOKEN_INVALID } = require('./errors');

function parseClientType(headers) {
  const v = (headers['x-client-type'] || headers['X-Client-Type'] || 'miniprogram').toLowerCase();
  return v === 'h5' || v === 'web' ? 'h5' : 'miniprogram';
}

function extractToken(headers) {
  const auth = headers['authorization'] || headers['Authorization'] || '';
  if (!auth) return null;
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return auth.trim();
}

/** 校验 Authorization，返回 payload 或抛 ApiError */
function authenticate(headers) {
  const token = extractToken(headers);
  if (!token) throw new (require('./errors').ApiError)(UNAUTHORIZED.code, UNAUTHORIZED.message, UNAUTHORIZED.httpStatus);
  try {
    return verifyToken(token);
  } catch (e) {
    if (e.message === 'expired') {
      throw new (require('./errors').ApiError)(TOKEN_EXPIRED.code, TOKEN_EXPIRED.message, TOKEN_EXPIRED.httpStatus);
    }
    throw new (require('./errors').ApiError)(TOKEN_INVALID.code, TOKEN_INVALID.message, TOKEN_INVALID.httpStatus);
  }
}

/** 由 Express req 构造 ctx（可选预置鉴权） */
function fromExpress(req, params = {}) {
  const headers = req.headers || {};
  return {
    params: Object.assign({}, req.params || {}, params),
    query: req.query || {},
    body: req.body || {},
    headers,
    clientType: parseClientType(headers),
    user: req.user || null,
    requestId: req.requestId || null,
  };
}

module.exports = { parseClientType, extractToken, authenticate, fromExpress };
