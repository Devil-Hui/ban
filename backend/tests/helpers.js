'use strict';

/** 测试辅助：注入全新内存仓储，并用与线上一致的路由表驱动 handler。 */

const { setRepos } = require('../src/repositories');
const { createMemoryRepos } = require('../src/repositories/memory');
const { match } = require('../src/server/routes');
const { setWxLoginVerifier } = require('../src/core/auth');
const { verifyToken } = require('../src/core/auth');
const { ApiError } = require('../src/core/errors');

/** 创建隔离的内存仓储并注入；返回 repos 便于断言 */
function setup() {
  const repos = createMemoryRepos();
  setRepos(repos);
  setWxLoginVerifier((code) => 'openid_' + code);
  return repos;
}

function parseQs(qs) {
  const o = {};
  if (!qs) return o;
  for (const pair of qs.split('&')) {
    const idx = pair.indexOf('=');
    const k = idx === -1 ? pair : pair.slice(0, idx);
    const v = idx === -1 ? '' : pair.slice(idx + 1);
    if (k) o[k] = decodeURIComponent(v);
  }
  return o;
}

/**
 * 直接调用路由 handler（与 Express/云函数同一逻辑），返回 data。
 * @param {string} method GET/POST/...
 * @param {string} path 含路径参数与可选查询串，如 /api/v1/share/tasks/t_1?token=abc
 * @param {object} opts { body, query, headers, user, token }
 */
async function request(method, path, opts = {}) {
  const [purePath, qs] = path.split('?');
  const m = match(method, purePath);
  if (!m) throw new Error('未匹配路由: ' + method + ' ' + path);
  let user = opts.user || null;
  const headers = Object.assign({}, opts.headers);
  if (opts.token) {
    const payload = verifyToken(opts.token);
    user = { userId: payload.userId, role: payload.role };
  }
  const ctx = {
    params: m.params,
    query: Object.assign({}, parseQs(qs), opts.query || {}),
    body: opts.body || {},
    headers,
    clientType: (headers['x-client-type'] || 'miniprogram').toLowerCase() === 'h5' ? 'h5' : 'miniprogram',
    user,
    requestId: 'test',
  };
  return m.route.handler(ctx);
}

module.exports = { setup, request, ApiError, verifyToken };
