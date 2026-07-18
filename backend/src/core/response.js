'use strict';

const crypto = require('crypto');
const { ApiError } = require('./errors');

/**
 * 统一响应包络（前后端约定）：
 * { code, message, data, requestId, timestamp }
 */
function requestId() {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return 'req-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
}

function ok(data = null, message = 'success') {
  return { code: 0, message, data, requestId: requestId(), timestamp: Date.now() };
}

/**
 * 将错误标准化为响应包络。
 * 兼容 ApiError 与普通 Error。
 */
function fail(error, rid) {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
      data: error.details,
      requestId: rid || requestId(),
      timestamp: Date.now(),
    };
  }
  // 未知错误，避免泄露堆栈
  return {
    code: 5000,
    message: error && error.message ? error.message : '服务器内部错误',
    data: null,
    requestId: rid || requestId(),
    timestamp: Date.now(),
  };
}

module.exports = { ok, fail, requestId };
