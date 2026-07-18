'use strict';

/**
 * 统一业务错误码（分层设计，符合大厂规范）。
 * - code=0 表示成功
 * - code 区间：系统级 4xxx/5xxx；业务模块 10xx~19xx
 * - httpStatus 用于映射 HTTP 状态码；包络体的 code 字段始终为业务 code
 */

class ApiError extends Error {
  constructor(code, message, httpStatus = 400, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// 系统/通用
const SUCCESS = { code: 0, message: 'success', httpStatus: 200 };
const INTERNAL_ERROR = { code: 5000, message: '服务器内部错误', httpStatus: 500 };
const VALIDATION_ERROR = { code: 5001, message: '参数校验失败', httpStatus: 400 };
const UPSTREAM_ERROR = { code: 5002, message: '依赖服务异常', httpStatus: 502 };

// 认证授权（4xxx）
const UNAUTHORIZED = { code: 4010, message: '未登录或登录已失效', httpStatus: 401 };
const TOKEN_EXPIRED = { code: 4011, message: '登录已过期，请重新登录', httpStatus: 401 };
const TOKEN_INVALID = { code: 4012, message: '登录凭证无效', httpStatus: 401 };
const FORBIDDEN = { code: 4030, message: '无权访问该资源', httpStatus: 403 };

// 资源
const NOT_FOUND = { code: 4040, message: '资源不存在', httpStatus: 404 };
const CONFLICT = { code: 4090, message: '资源状态冲突，请刷新后重试', httpStatus: 409 };
const RATE_LIMITED = { code: 4290, message: '请求过于频繁，请稍后再试', httpStatus: 429 };

// 用户模块 11xx
const USER_NOT_FOUND = { code: 1101, message: '用户不存在', httpStatus: 404 };
const CALENDAR_NOT_FOUND = { code: 1102, message: '个人日程表不存在', httpStatus: 404 };
const CALENDAR_OCR_FAILED = { code: 1103, message: '课表识别失败，请手动录入', httpStatus: 422 };

// 分组模块 12xx
const GROUP_NOT_FOUND = { code: 1201, message: '分组不存在', httpStatus: 404 };
const INVITE_CODE_INVALID = { code: 1202, message: '邀请码无效', httpStatus: 400 };
const ALREADY_MEMBER = { code: 1203, message: '你已在该分组中', httpStatus: 409 };
const NOT_GROUP_PUBLISHER = { code: 1204, message: '仅分组发布者可执行该操作', httpStatus: 403 };
const MEMBER_BLACKLISTED = { code: 1205, message: '你已被该分组封禁，无法加入', httpStatus: 403 };
const CANNOT_LEAVE = { code: 1206, message: '存在进行中的任务，暂不能退出', httpStatus: 409 };

// 任务模块 13xx
const TASK_NOT_FOUND = { code: 1301, message: '任务不存在', httpStatus: 404 };
const TASK_NOT_PUBLISHER = { code: 1302, message: '仅任务发布者可执行该操作', httpStatus: 403 };
const TASK_STATUS_INVALID = { code: 1303, message: '当前任务状态不允许该操作', httpStatus: 409 };
const TASK_DEADLINE_PASSED = { code: 1304, message: '任务收集已截止', httpStatus: 409 };
const TASK_GENERATING = { code: 1305, message: '方案生成中，请稍候', httpStatus: 409 };
const TASK_INSUFFICIENT = { code: 1306, message: '有效空闲标记不足，无法生成方案', httpStatus: 422 };
const TASK_VERSION_CONFLICT = { code: 1307, message: '数据已被他人更新，请刷新后重试', httpStatus: 409 };

// 空闲标记模块 14xx
const RESPONSE_NOT_COLLECTING = { code: 1401, message: '当前不在收集中，无法标记', httpStatus: 409 };
const RESPONSE_ALREADY = { code: 1402, message: '你已提交过空闲时间', httpStatus: 409 };

// 回执/异议模块 15xx
const RECEIPT_NOT_ASSIGNED = { code: 1501, message: '你未被分配到该排班', httpStatus: 403 };
const RECEIPT_ALREADY_RESOLVED = { code: 1502, message: '该异议已处理', httpStatus: 409 };

// 分享预览模块 16xx
const PREVIEW_TOKEN_INVALID = { code: 1601, message: '预览链接无效', httpStatus: 403 };
const PREVIEW_TOKEN_EXPIRED = { code: 1602, message: '预览链接已过期，请联系发布者重新分享', httpStatus: 410 };

// 消息模块 17xx
const NOTIFY_SUBSCRIBE_FAILED = { code: 1701, message: '订阅消息授权失败', httpStatus: 400 };

// 支付模块 18xx
const PAY_ORDER_CREATE_FAILED = { code: 1801, message: '创建支付订单失败', httpStatus: 502 };
const PAY_ORDER_NOT_FOUND = { code: 1802, message: '支付订单不存在', httpStatus: 404 };
const PAY_CALLBACK_VERIFY_FAILED = { code: 1803, message: '支付回调验签失败', httpStatus: 400 };

// 异步任务模块 19xx
const JOB_NOT_FOUND = { code: 1901, message: '异步任务不存在', httpStatus: 404 };
const JOB_FAILED = { code: 1902, message: '异步任务执行失败', httpStatus: 422 };

const TABLE = {
  SUCCESS,
  INTERNAL_ERROR,
  VALIDATION_ERROR,
  UPSTREAM_ERROR,
  UNAUTHORIZED,
  TOKEN_EXPIRED,
  TOKEN_INVALID,
  FORBIDDEN,
  NOT_FOUND,
  CONFLICT,
  RATE_LIMITED,
  USER_NOT_FOUND,
  CALENDAR_NOT_FOUND,
  CALENDAR_OCR_FAILED,
  GROUP_NOT_FOUND,
  INVITE_CODE_INVALID,
  ALREADY_MEMBER,
  NOT_GROUP_PUBLISHER,
  MEMBER_BLACKLISTED,
  CANNOT_LEAVE,
  TASK_NOT_FOUND,
  TASK_NOT_PUBLISHER,
  TASK_STATUS_INVALID,
  TASK_DEADLINE_PASSED,
  TASK_GENERATING,
  TASK_INSUFFICIENT,
  TASK_VERSION_CONFLICT,
  RESPONSE_NOT_COLLECTING,
  RESPONSE_ALREADY,
  RECEIPT_NOT_ASSIGNED,
  RECEIPT_ALREADY_RESOLVED,
  PREVIEW_TOKEN_INVALID,
  PREVIEW_TOKEN_EXPIRED,
  NOTIFY_SUBSCRIBE_FAILED,
  PAY_ORDER_CREATE_FAILED,
  PAY_ORDER_NOT_FOUND,
  PAY_CALLBACK_VERIFY_FAILED,
  JOB_NOT_FOUND,
  JOB_FAILED,
};

/**
 * 由错误名生成一个 ApiError 实例。
 * @param {string} name TABLE 中的键
 * @param {object} [override] 可选覆盖 {message, details}
 */
function err(name, override = {}) {
  const def = TABLE[name];
  if (!def) return new ApiError(INTERNAL_ERROR.code, override.message || '未知错误', override.httpStatus || 500, override.details);
  return new ApiError(
    def.code,
    override.message || def.message,
    override.httpStatus || def.httpStatus,
    override.details || null
  );
}

module.exports = { ApiError, err, TABLE };
