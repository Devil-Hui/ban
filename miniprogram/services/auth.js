// services/auth.js — 用户相关接口（统一解包）
const { get, put, patch, post } = require('../utils/request');

const me = async () => {
  const res = await get('/users/me');
  return (res && res.user) || res;
};
const updateMe = async (body) => {
  const res = await patch('/users/me', body);
  return (res && res.user) || res;
};
const getCalendar = async () => {
  try {
    const res = await get('/users/me/calendar', null, { silent: true });
    return (res && res.calendar) || res;
  } catch (e) {
    // 未建日历时后端可能 404：前端展示空态
    return null;
  }
};
const putCalendar = async (data) => {
  const res = await put('/users/me/calendar', data);
  return (res && res.calendar) || res;
};
// OCR 需 imageUrl；未选图时由页面拦截
const ocrCalendar = (data) => post('/users/me/calendar/ocr', data || {});

/** GET /users/me/assignments?month=YYYY-MM —— 日程页班次真相源 */
const listMyAssignments = async (params) => {
  const res = await get('/users/me/assignments', params || null, { silent: true });
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.list)) return res.list;
  return [];
};

module.exports = { me, updateMe, getCalendar, putCalendar, ocrCalendar, listMyAssignments };
