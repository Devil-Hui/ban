// constants/error-codes.js — API / business code → Chinese message
// Prefer server `error.message` when present; fall back via messageForCode.

const ERROR_MESSAGES = {
  // Platform API codes
  INVALID_ARGUMENT: '参数不合法',
  UNAUTHENTICATED: '未登录或登录已失效',
  PERMISSION_DENIED: '无权访问该资源',
  NOT_FOUND: '资源不存在',
  ALREADY_EXISTS: '资源已存在',
  VERSION_CONFLICT: '数据已被他人更新，请刷新后重试',
  RATE_LIMITED: '请求过于频繁，请稍后再试',
  DEPENDENCY_UNAVAILABLE: '依赖服务异常',
  INTERNAL: '服务器内部错误',

  // Task-create / form validation
  TASK_SLOT_REQUIRED: '请先选定可排班时段',
  RESERVED_LIST_REQUIRED: '预留名单不能为空',
  GROUP_NAME_INVALID: '分组名不合法',
};

function messageForCode(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || '请求失败';
}

module.exports = {
  ERROR_MESSAGES,
  messageForCode,
};
