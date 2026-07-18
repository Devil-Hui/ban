'use strict';

/**
 * 云函数入口（微信云开发 CloudBase / 腾讯云 SCF）。
 * 同一套 handler 与路由表，无需改动业务逻辑即可部署。
 *
 * 入参 event（API 网关/云函数 HTTP 触发）示例：
 * {
 *   httpMethod: 'POST',
 *   path: '/api/v1/groups',
 *   headers: { 'authorization': 'Bearer xxx', 'x-client-type': 'miniprogram' },
 *   queryString: {},
 *   body: '{"name":"值日组"}'   // 可能为 JSON 字符串或对象
 * }
 */

const { ok, fail } = require('../core/response');
const { authenticate } = require('../core/context');
const { match } = require('./routes');

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_) {
      return {};
    }
  }
  return body;
}

function buildContext(event) {
  const headers = event.headers || {};
  const method = (event.httpMethod || 'GET').toUpperCase();
  const path = (event.path || '').split('?')[0];
  const matched = match(method, path);
  const params = matched ? matched.params : {};
  const query = event.queryString || {};
  const user = (() => {
    try {
      return authenticate(event.headers || {});
    } catch (_) {
      return null;
    }
  })();
  return {
    params,
    query,
    body: parseBody(event.body),
    headers,
    clientType: (headers['x-client-type'] || headers['X-Client-Type'] || 'miniprogram').toLowerCase() === 'h5' ? 'h5' : 'miniprogram',
    user,
    requestId: null,
  };
}

/**
 * 云函数 main 入口。
 * @returns Promise<{ statusCode, headers, body }> 兼容云函数 HTTP 触发器
 */
async function main(event = {}, _context = {}) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const path = (event.path || '').split('?')[0];
  const matched = match(method, path);
  if (!matched) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fail({ code: 4040, message: '接口不存在', httpStatus: 404 })) };
  }
  try {
    const ctx = buildContext(event);
    const data = await matched.route.handler(ctx);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ok(data)) };
  } catch (e) {
    const status = e.httpStatus || 500;
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fail(e)) };
  }
}

module.exports = { main, buildContext };
