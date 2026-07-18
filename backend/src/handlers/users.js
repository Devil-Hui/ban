'use strict';

/** 用户模块：个人资料、个人日程（课表）、OCR 识别异步任务。 */

const { required, optional } = require('../core/validate');
const { err } = require('../core/errors');
const { requireAuth } = require('./guard');

function maskUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    phone: u.phoneEnc ? maskPhone(u.phoneEnc) : null,
    isBanned: u.isBanned,
  };
}
function maskPhone(enc) {
  // enc 形如 '138****1234' 或密文；此处仅脱敏展示
  if (typeof enc === 'string' && enc.includes('****')) return enc;
  return String(enc).slice(0, 3) + '****' + String(enc).slice(-4);
}

/** GET /api/v1/users/me */
async function getMe(ctx) {
  const user = requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  const u = await repos.users.getById(user.userId);
  if (!u) throw err('USER_NOT_FOUND');
  return { user: maskUser(u) };
}

/** PATCH /api/v1/users/me */
async function updateMe(ctx) {
  const user = requireAuth(ctx);
  const patch = optional(ctx.body, {
    nickname: { type: 'string', maxLen: 32 },
    avatarUrl: { type: 'string', maxLen: 255 },
  });
  const repos = require('../repositories').getRepos();
  const u = await repos.users.updateProfile(user.userId, patch);
  if (!u) throw err('USER_NOT_FOUND');
  return { user: maskUser(u) };
}

/** GET /api/v1/users/me/calendar */
async function getCalendar(ctx) {
  const user = requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  const cal = await repos.users.getCalendar(user.userId);
  if (!cal) throw err('CALENDAR_NOT_FOUND');
  return { calendar: cal };
}

/** PUT /api/v1/users/me/calendar */
async function upsertCalendar(ctx) {
  const user = requireAuth(ctx);
  const data = required(ctx.body, {
    semesterName: { type: 'string', label: 'semesterName' },
    cycleRule: { type: 'string', enum: ['weekly', 'odd_weekly', 'even_weekly', 'custom'], default: 'weekly' },
    slots: { type: 'array', default: [] },
  });
  const repos = require('../repositories').getRepos();
  const cal = await repos.users.upsertCalendar(user.userId, Object.assign({ source: 'manual' }, data));
  return { calendar: cal };
}

/** POST /api/v1/users/me/calendar/ocr —— 异步识别，返回 jobId */
async function ocrCalendar(ctx) {
  const user = requireAuth(ctx);
  const { imageUrl } = required(ctx.body, { imageUrl: { type: 'string', label: 'imageUrl' } });
  const repos = require('../repositories').getRepos();
  const job = await repos.tasks.createJob({ type: 'calendar_ocr', payload: { userId: user.userId, imageUrl } });
  return { jobId: job.id, status: job.status };
}

/**
 * GET /api/v1/users/me/assignments
 * query: month=YYYY-MM（可选）
 * 数据链：user_assignments ⋈ tasks ⋈ groups —— 日程页「我的班次」真相源
 */
async function listMyAssignments(ctx) {
  const user = requireAuth(ctx);
  const q = optional(ctx.query || {}, {
    month: { type: 'string', default: null },
  });
  const repos = require('../repositories').getRepos();
  if (!repos.tasks.listAssignmentsByUser) {
    return { list: [], total: 0 };
  }
  const list = await repos.tasks.listAssignmentsByUser(user.userId, {
    activeOnly: true,
    month: q.month || null,
  });
  return { list, total: list.length, month: q.month || null };
}

/**
 * POST /api/v1/users/me/calendar/sync-from-published
 * 设计板「同步到日历」：把已发布排班中的「我的班次」合并进 personal_calendars.slots
 * body: { taskId? } 不传则同步全部已发布 assignments
 */
async function syncFromPublished(ctx) {
  const user = requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  if (!repos.tasks.listAssignmentsByUser) {
    return { synced: 0, calendar: null };
  }
  const taskId = ctx.body && (ctx.body.taskId || ctx.body.task_id);
  let list = await repos.tasks.listAssignmentsByUser(user.userId, { activeOnly: true });
  if (taskId) {
    list = (list || []).filter((a) => String(a.taskId) === String(taskId));
  }
  const slots = (list || []).map((a) => ({
    date: a.date,
    periodId: a.periodId || a.period_id || null,
    start: a.start || null,
    end: a.end || null,
    name: a.periodName || a.periodLabel || a.periodId || '班次',
    taskId: a.taskId,
    taskTitle: a.taskTitle || a.groupName || '',
    source: 'published_schedule',
  }));

  let existing = null;
  try {
    existing = await repos.users.getCalendar(user.userId);
  } catch (_) {
    existing = null;
  }
  const prevSlots = (existing && existing.slots) || [];
  // 去掉旧的 published_schedule 同源条目，再合并
  const kept = prevSlots.filter((s) => s && s.source !== 'published_schedule');
  const merged = kept.concat(slots);
  const cal = await repos.users.upsertCalendar(user.userId, {
    semesterName: (existing && existing.semesterName) || '我的排班日历',
    cycleRule: (existing && existing.cycleRule) || 'weekly',
    slots: merged,
    source: 'schedule_sync',
  });
  return { synced: slots.length, calendar: cal };
}

module.exports = {
  getMe,
  updateMe,
  getCalendar,
  upsertCalendar,
  ocrCalendar,
  listMyAssignments,
  syncFromPublished,
};
