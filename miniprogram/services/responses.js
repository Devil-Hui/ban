// services/responses.js — 班务意愿填报（成员侧）
// 契约：提交用 availableSlots；前端芯片结构用 availability，service 层转换
const { get, put } = require('../utils/request');

function toAvailableSlots(data) {
  if (!data) return [];
  if (Array.isArray(data.availableSlots)) return data.availableSlots;
  if (Array.isArray(data.availability)) {
    return data.availability
      .map((a) => ({ date: a.date, slots: a.slots || [] }))
      .filter((a) => a.date && a.slots.length > 0);
  }
  return [];
}

const submit = (taskId, data) => {
  const availableSlots = toAvailableSlots(data);
  return put(`/tasks/${taskId}/responses/me`, {
    availableSlots,
    source: (data && data.source) || 'manual',
    note: (data && data.note) || '',
  });
};

const getMine = async (taskId) => {
  try {
    const res = await get(`/tasks/${taskId}/responses/me`, null, { silent: true });
    const response = (res && res.response) || res;
    if (!response) return null;
    // 统一给页面 availability
    const availability = response.availability || response.availableSlots || [];
    return Object.assign({}, response, { availability });
  } catch (e) {
    // 尚未提交：不算错误
    if (e && (e.code === 4040 || e.code === 404 || String(e.message || '').indexOf('尚未') >= 0)) {
      return null;
    }
    throw e;
  }
};

module.exports = { submit, getMine };
