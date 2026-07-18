'use strict';

/**
 * 统一路由表（RESTful，资源名复数、小写+连字符）。
 * Express 适配器与云函数适配器共用同一张表，保证多端行为一致。
 */

const auth = require('../handlers/auth');
const users = require('../handlers/users');
const groups = require('../handlers/groups');
const tasks = require('../handlers/tasks');
const responses = require('../handlers/responses');
const receipts = require('../handlers/receipts');
const preview = require('../handlers/preview');
const notify = require('../handlers/notify');
const scheduleProfiles = require('../handlers/scheduleProfiles');

const ROUTES = [
  // 鉴权
  { method: 'POST', path: '/api/v1/auth/miniprogram/login', handler: auth.miniprogramLogin },
  { method: 'POST', path: '/api/v1/auth/h5/login', handler: auth.h5Login },
  { method: 'POST', path: '/api/v1/auth/refresh', handler: auth.refresh },

  // 元数据 / 作息模板（P0）
  { method: 'GET', path: '/api/v1/meta/time-constants', handler: scheduleProfiles.getTimeMeta },
  { method: 'GET', path: '/api/v1/meta/notify-templates', handler: notify.getTemplates },
  { method: 'GET', path: '/api/v1/schedule-profiles', handler: scheduleProfiles.listProfiles },
  { method: 'GET', path: '/api/v1/schedule-profiles/:profileId', handler: scheduleProfiles.getProfile },
  { method: 'GET', path: '/api/v1/groups/:groupId/schedule-profile', handler: scheduleProfiles.getGroupProfile },
  { method: 'PUT', path: '/api/v1/groups/:groupId/schedule-profile', handler: scheduleProfiles.putGroupProfile },
  { method: 'POST', path: '/api/v1/groups/:groupId/schedule-profile/import', handler: scheduleProfiles.importGroupProfile },

  // 用户
  { method: 'GET', path: '/api/v1/users/me', handler: users.getMe },
  { method: 'PATCH', path: '/api/v1/users/me', handler: users.updateMe },
  { method: 'GET', path: '/api/v1/users/me/calendar', handler: users.getCalendar },
  { method: 'PUT', path: '/api/v1/users/me/calendar', handler: users.upsertCalendar },
  { method: 'POST', path: '/api/v1/users/me/calendar/ocr', handler: users.ocrCalendar },
  { method: 'GET', path: '/api/v1/users/me/assignments', handler: users.listMyAssignments },

  // 分组
  { method: 'POST', path: '/api/v1/groups', handler: groups.create },
  { method: 'GET', path: '/api/v1/groups', handler: groups.listMine },
  { method: 'POST', path: '/api/v1/groups/join', handler: groups.join },
  { method: 'GET', path: '/api/v1/groups/:groupId', handler: groups.getOne },
  { method: 'GET', path: '/api/v1/groups/:groupId/members', handler: groups.listMembers },
  { method: 'DELETE', path: '/api/v1/groups/:groupId/members/:userId', handler: groups.kick },
  { method: 'POST', path: '/api/v1/groups/:groupId/members/leave', handler: groups.leave },

  // 任务
  { method: 'POST', path: '/api/v1/groups/:groupId/tasks', handler: tasks.create },
  { method: 'GET', path: '/api/v1/groups/:groupId/tasks', handler: tasks.listByGroup },
  { method: 'GET', path: '/api/v1/tasks/:taskId', handler: tasks.getOne },
  { method: 'POST', path: '/api/v1/tasks/:taskId/scheme-jobs', handler: tasks.generate },
  { method: 'GET', path: '/api/v1/jobs/:jobId', handler: tasks.getJob },
  { method: 'POST', path: '/api/v1/tasks/:taskId/publish', handler: tasks.publish },
  { method: 'POST', path: '/api/v1/tasks/:taskId/deadline/extend', handler: tasks.extendDeadline },
  { method: 'POST', path: '/api/v1/tasks/:taskId/cancel', handler: tasks.cancel },
  { method: 'POST', path: '/api/v1/tasks/:taskId/adjust', handler: tasks.adjust },

  // 空闲标记
  { method: 'PUT', path: '/api/v1/tasks/:taskId/responses/me', handler: responses.submit },
  { method: 'GET', path: '/api/v1/tasks/:taskId/responses/me', handler: responses.getMine },

  // 异议回执
  { method: 'POST', path: '/api/v1/tasks/:taskId/receipts/me/objection', handler: receipts.objection },
  { method: 'GET', path: '/api/v1/tasks/:taskId/receipts/me', handler: receipts.getMine },

  // 分享预览（H5 公开只读，无需登录）
  { method: 'GET', path: '/api/v1/share/tasks/:taskId', handler: preview.getShared },

  // 消息
  { method: 'POST', path: '/api/v1/notify/subscribe', handler: notify.subscribe },
  { method: 'GET', path: '/api/v1/users/me/inbox', handler: notify.listInbox },
  { method: 'PATCH', path: '/api/v1/users/me/inbox/:messageId', handler: notify.readInbox },
];

/** 将路径模式编译为正则，并提取参数名 */
function compile(path) {
  const names = [];
  const regexStr = path.replace(/:([A-Za-z_]+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp('^' + regexStr + '$'), names };
}

const COMPILED = ROUTES.map((r) => Object.assign({ compiled: compile(r.path) }, r));

/** 匹配 method + path，返回 { route, params } 或 null */
function match(method, path) {
  for (const r of COMPILED) {
    if (r.method !== method) continue;
    const m = r.compiled.regex.exec(path);
    if (!m) continue;
    const params = {};
    r.compiled.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
    return { route: r, params };
  }
  return null;
}

module.exports = { ROUTES, match };
