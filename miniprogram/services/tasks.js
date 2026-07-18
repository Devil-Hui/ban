// services/tasks.js — 排班任务接口
const { get, post } = require('../utils/request');

function unwrapList(data, keys) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

const create = async (groupId, data) => {
  const res = await post(`/groups/${groupId}/tasks`, data);
  return (res && res.task) || res;
};
const listByGroup = async (groupId) => {
  const res = await get(`/groups/${groupId}/tasks`);
  return unwrapList(res, ['list', 'tasks']);
};
const getOne = async (taskId) => {
  const res = await get(`/tasks/${taskId}`);
  const t = (res && res.task) || res;
  // 前端分支依赖 myRole：详情接口若未带，页面需结合 groups 上下文；此处透传
  return t;
};
// 生成方案：返回 { jobId, status }
const generate = async (taskId) => {
  const res = await post(`/tasks/${taskId}/scheme-jobs`);
  return res || {};
};
const getJob = async (jobId) => {
  const res = await get(`/jobs/${jobId}`);
  return (res && res.job) || res;
};
// 发布：允许空 body（后端用 candidateSchedules[0] 兜底）
const publish = async (taskId, body) => {
  const res = await post(`/tasks/${taskId}/publish`, body || {});
  return res || {};
};
const extendDeadline = (taskId, data) => post(`/tasks/${taskId}/deadline/extend`, data);
const cancel = (taskId) => post(`/tasks/${taskId}/cancel`);
const adjust = (taskId, data) => post(`/tasks/${taskId}/adjust`, data);

module.exports = {
  create,
  listByGroup,
  getOne,
  generate,
  getJob,
  publish,
  extendDeadline,
  cancel,
  adjust,
};
