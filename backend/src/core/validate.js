'use strict';

/**
 * 轻量参数校验与提取。
 * 规则示例：
 *   required(ctx.query, { groupId: { type:'string' } })
 *   optional(ctx.body, { page: { type:'int', default:1, min:1 } })
 * 非法时抛 VALIDATION_ERROR。
 */

const { err } = require('./errors');

function coerce(value, rule) {
  if (value === undefined || value === null || value === '') {
    if (rule.default !== undefined) return rule.default;
    if (rule.required) throw err('VALIDATION_ERROR', { message: `缺少必填参数: ${rule.label || rule.key || 'field'}` });
    return rule.default !== undefined ? rule.default : null;
  }
  let v = value;
  if (rule.type === 'int' || rule.type === 'number') {
    const n = rule.type === 'int' ? parseInt(value, 10) : Number(value);
    if (Number.isNaN(n)) throw err('VALIDATION_ERROR', { message: `参数 ${rule.label || ''} 必须为数字` });
    v = n;
    if (rule.min !== undefined && n < rule.min) throw err('VALIDATION_ERROR', { message: `参数 ${rule.label || ''} 不能小于 ${rule.min}` });
    if (rule.max !== undefined && n > rule.max) throw err('VALIDATION_ERROR', { message: `参数 ${rule.label || ''} 不能大于 ${rule.max}` });
  }
  if (rule.type === 'string' && typeof v !== 'string') v = String(v);
  if (rule.type === 'boolean') v = value === true || value === 'true' || value === 1 || value === '1';
  if (rule.type === 'array' && !Array.isArray(v)) v = Array.isArray(value) ? value : [value];
  if (rule.enum && !rule.enum.includes(v)) {
    throw err('VALIDATION_ERROR', { message: `参数 ${rule.label || ''} 取值非法，应为 ${rule.enum.join('/')}` });
  }
  if (rule.type === 'string' && rule.maxLen && v.length > rule.maxLen) {
    throw err('VALIDATION_ERROR', { message: `参数 ${rule.label || ''} 长度不能超过 ${rule.maxLen}` });
  }
  return v;
}

/** 处理一组规则，返回干净的对象 */
function process(source, rules) {
  const out = {};
  for (const key of Object.keys(rules)) {
    const rule = Object.assign({ key }, rules[key]);
    out[key] = coerce(source[key], rule);
  }
  return out;
}

function required(source, rules) {
  // 标记必填后走 process
  const withReq = {};
  for (const k of Object.keys(rules)) withReq[k] = Object.assign({ required: true }, rules[k]);
  return process(source, withReq);
}

function optional(source, rules) {
  return process(source, rules);
}

module.exports = { required, optional, coerce, process };
