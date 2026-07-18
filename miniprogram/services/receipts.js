// services/receipts.js — 排班异议/申诉（成员侧）
// 后端字段：objectionReason；前端表单可用 content，此处归一
const { get, post } = require('../utils/request');

const objection = (taskId, data) => {
  const reason = (data && (data.objectionReason || data.content || data.reason)) || '';
  return post(`/tasks/${taskId}/receipts/me/objection`, {
    objectionReason: String(reason).slice(0, 200),
  });
};

const getMine = async (taskId) => {
  try {
    const res = await get(`/tasks/${taskId}/receipts/me`, null, { silent: true });
    return (res && res.receipt) || res;
  } catch (e) {
    return null;
  }
};

module.exports = { objection, getMine };
