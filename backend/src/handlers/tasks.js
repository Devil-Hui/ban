'use strict';

/** 任务（排班任务）模块：创建、列表、详情、生成方案(异步)、发布、延长截止、取消、调整。 */

const { required, optional } = require('../core/validate');
const { err } = require('../core/errors');
const { requireAuth, requireGroupMember, requireTask, requireTaskPublisher } = require('./guard');
const config = require('../config');
const {
  resolvePeriods,
  DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META,
  normalizeSlots,
} = require('../domain/time');

/** POST /api/v1/groups/{group_id}/tasks
 * 逻辑链：校验发布者 → 解析 timeMode + profile → periods 快照落库
 */
async function create(ctx) {
  const user = requireAuth(ctx);
  await requireGroupMember(ctx, ctx.params.groupId);
  const repos = require('../repositories').getRepos();
  const member = await repos.groups.getMember(ctx.params.groupId, user.userId);
  if (!member || member.roleInGroup !== 'publisher') throw err('NOT_GROUP_PUBLISHER');

  const data = required(ctx.body, { title: { type: 'string', label: 'title', maxLen: 60 } });
  const extra = optional(ctx.body, {
    mode: { type: 'string', enum: ['timeline', 'shift', 'custom'], default: 'shift' },
    periods: { type: 'array', default: [] },
    deadline: { type: 'string', default: null },
    dateRangeStart: { type: 'string', default: null },
    dateRangeEnd: { type: 'string', default: null },
    constraints: { type: 'object', default: { slotMinPeople: 1, maxShiftsPerWeek: null, maxShiftsPerDay: null } },
    timeMode: { type: 'string', default: null },
    scheduleProfileId: { type: 'string', default: null },
    selectedPeriodIds: { type: 'array', default: null },
    customRanges: { type: 'array', default: null },
    timeOverrides: { type: 'object', default: null },
  });

  const settingsRaw =
    (repos.scheduleProfiles.getSettings && repos.scheduleProfiles.getSettings()) ||
    { defaultTimeMode: DEFAULT_TASK_TIME_MODE, defaultProfileId: 'sys_uni_45min_v1' };
  const settings =
    settingsRaw && typeof settingsRaw.then === 'function' ? await settingsRaw : settingsRaw;
  const timeMode = extra.timeMode || (settings && settings.defaultTimeMode) || DEFAULT_TASK_TIME_MODE;
  if (!TIME_MODE_META[timeMode]) {
    throw err('VALIDATION_ERROR', { message: '无效的 timeMode' });
  }

  // 解析 profile：显式 id → 分组作息 → 系统默认
  let profile = null;
  let profileId = extra.scheduleProfileId || null;
  if (profileId) {
    profile = await repos.scheduleProfiles.getById(profileId);
  }
  if (!profile) {
    profile = await repos.scheduleProfiles.getGroupProfile(ctx.params.groupId);
    if (profile) profileId = profile.sourceProfileId || profile.id;
  }
  if (!profile) {
    profile = await repos.scheduleProfiles.getDefault();
    if (profile) profileId = profile.id;
  }

  let periods;
  try {
    if (Array.isArray(extra.periods) && extra.periods.length) {
      // 客户端已给最终 periods：仍归一化
      periods = normalizeSlots(extra.periods);
      if (!periods.length) throw Object.assign(new Error('empty'), { code: 'PERIODS_EMPTY' });
    } else {
      periods = resolvePeriods({
        mode: timeMode,
        profileSlots: (profile && profile.slots) || [],
        selectedIds: extra.selectedPeriodIds || null,
        customRanges: extra.customRanges || null,
        timeOverrides: extra.timeOverrides || null,
      });
    }
  } catch (e) {
    if (e.code === 'PERIODS_EMPTY') {
      throw err('VALIDATION_ERROR', { message: '请至少配置一个时段（节次或时间段）' });
    }
    if (e.code === 'INVALID_TIME_MODE') {
      throw err('VALIDATION_ERROR', { message: '无效的 timeMode' });
    }
    if (e.code === 'INVALID_PERIOD_TIME') {
      throw err('VALIDATION_ERROR', { message: '时段起止时间不合法' });
    }
    throw e;
  }

  const task = await repos.tasks.create({
    groupId: ctx.params.groupId,
    publisherId: user.userId,
    title: data.title,
    mode: extra.mode,
    timeMode,
    periods,
    scheduleProfileId: profileId,
    scheduleProfileVersion: profile && profile.version != null ? profile.version : null,
    deadline: extra.deadline,
    dateRangeStart: extra.dateRangeStart,
    dateRangeEnd: extra.dateRangeEnd,
    constraints: extra.constraints,
  });
  // 截止调度：写入 reminder + deadline countdown（无 deadline 则跳过）
  if (extra.deadline && repos.countdowns && repos.countdowns.replaceForTask) {
    const { buildCountdownPlan } = require('../domain/countdown');
    const plan = buildCountdownPlan(extra.deadline, {
      reminderHours: config.deadlineReminderHours,
    });
    if (plan.length) await repos.countdowns.replaceForTask(task.id, plan);
  }
  return { task };
}

/** GET /api/v1/groups/{group_id}/tasks */
async function listByGroup(ctx) {
  const user = requireAuth(ctx);
  await requireGroupMember(ctx, ctx.params.groupId);
  const q = optional(ctx.query, {
    status: { type: 'string', default: null },
    page: { type: 'int', default: 1, min: 1 },
    pageSize: { type: 'int', default: config.defaultPageSize, min: 1, max: config.maxPageSize },
  });
  const repos = require('../repositories').getRepos();
  const result = await repos.tasks.listByGroup(ctx.params.groupId, q);
  return result;
}

/** GET /api/v1/tasks/{task_id}
 * 注入 myRole / responseCount，供任务页按角色×状态渲染按钮
 */
async function getOne(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTask(ctx, ctx.params.taskId);
  const member = await requireGroupMember(ctx, task.groupId);
  const repos = require('../repositories').getRepos();
  let responseCount = 0;
  let memberCount = 0;
  try {
    const list = await repos.responses.listByTask(task.id);
    responseCount = (list || []).length;
  } catch (_) {}
  try {
    const members = await repos.groups.listMembers(task.groupId);
    memberCount = (members || []).length;
  } catch (_) {}
  return {
    task: Object.assign({}, task, {
      myRole: member.roleInGroup,
      responseCount,
      memberCount,
      // 兼容旧客户端：无 timeMode 时给默认
      timeMode: task.timeMode || DEFAULT_TASK_TIME_MODE,
    }),
  };
}

/**
 * 简易排班引擎：按任务 periods × 日期范围，从有效填报中轮询/随机取人。
 * 产出 candidate_schedules 快照，供发布使用。
 */
function buildCandidateSchedules(task, responses) {
  const periods = Array.isArray(task.periods) ? task.periods : [];
  const minPeople = (task.constraints && task.constraints.slotMinPeople) || 1;
  const start = task.dateRangeStart;
  const end = task.dateRangeEnd;
  const dates = [];
  if (start && end) {
    const s = new Date(String(start).replace(/-/g, '/') + ' 00:00:00');
    const e = new Date(String(end).replace(/-/g, '/') + ' 00:00:00');
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
  }
  if (!dates.length) dates.push(new Date().toISOString().slice(0, 10));

  // userId -> Set of "date|periodId" available
  const avail = new Map();
  for (const r of responses || []) {
    if (!r || r.isValid === 0 || r.isValid === false) continue;
    const slots = r.availableSlots || r.availability || [];
    const set = avail.get(r.userId) || new Set();
    if (Array.isArray(slots)) {
      slots.forEach((item) => {
        if (typeof item === 'string') {
          set.add(item);
        } else if (item && item.date) {
          const ps = item.slots || item.periodIds || [];
          ps.forEach((pid) => set.add(`${item.date}|${pid}`));
        }
      });
    }
    avail.set(r.userId, set);
  }
  const userIds = Array.from(avail.keys());

  function oneScheme(seedName) {
    const assignments = [];
    let cursor = 0;
    for (const date of dates) {
      for (const p of periods) {
        const pid = p.id || p.periodId || p.slot;
        const candidates = userIds.filter((uid) => {
          const set = avail.get(uid);
          return set && (set.has(`${date}|${pid}`) || set.has(pid));
        });
        const picked = [];
        if (candidates.length) {
          for (let i = 0; i < minPeople; i++) {
            picked.push(candidates[(cursor + i) % candidates.length]);
          }
          cursor += 1;
        }
        assignments.push({
          date,
          periodId: pid,
          periodName: p.name || p.label || pid,
          userIds: Array.from(new Set(picked)),
          userNames: [],
        });
      }
    }
    return { schemeName: seedName, assignments };
  }

  return [oneScheme('方案A-均衡'), oneScheme('方案B-轮转')];
}

/** POST /api/v1/tasks/{task_id}/scheme-jobs —— 触发生成方案（同步完成，便于 B2B/联调） */
async function generate(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTaskPublisher(ctx, ctx.params.taskId);
  const repos = require('../repositories').getRepos();
  const responses = await repos.responses.listByTask(task.id);
  const minPeople = (task.constraints && task.constraints.slotMinPeople) || 1;
  if (responses.length < minPeople) {
    throw err('TASK_INSUFFICIENT', { details: { got: responses.length, need: minPeople } });
  }

  const job = await repos.tasks.createJob({ type: 'scheme_generate', payload: { taskId: task.id } });
  await repos.tasks.updateWithVersion(task.id, { generatingJobId: job.id }, task.version);

  // 同步跑引擎并落库（生产可改为队列 worker）
  try {
    const fresh = await repos.tasks.getById(task.id);
    const schemes = buildCandidateSchedules(fresh, responses);
    if (repos.tasks.updateJob) {
      await repos.tasks.updateJob(job.id, {
        status: 'success',
        progress: 100,
        result: { candidateSchedules: schemes },
      });
    }
    const v = (await repos.tasks.getById(task.id)).version;
    await repos.tasks.updateWithVersion(
      task.id,
      {
        candidateSchedules: schemes,
        generatingJobId: null,
        status: fresh.status === 'collecting' ? 'reviewing' : fresh.status,
      },
      v
    );
    return { jobId: job.id, status: 'success', candidateCount: schemes.length };
  } catch (e) {
    if (repos.tasks.updateJob) {
      await repos.tasks.updateJob(job.id, {
        status: 'failed',
        progress: 100,
        error: e.message || 'generate failed',
      });
    }
    throw e;
  }
}

/** GET /api/v1/jobs/{job_id} */
async function getJob(ctx) {
  const user = requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  const job = await repos.tasks.getJob(ctx.params.jobId);
  if (!job) throw err('JOB_NOT_FOUND');
  await requireTaskPublisher(ctx, job.payload.taskId);
  return { job };
}

/** POST /api/v1/tasks/{task_id}/publish
 * 按钮链：发布者点「发布排班」
 * 逻辑链：校验发布者 → 选定/兜底 finalSchedule → 事务写 tasks+assignments+inbox → 刷新 share_token
 * 数据链：tasks.final_schedule/status/share_token；user_assignments 快照；notify_inbox 全员
 * 兼容：前端未带 finalSchedule 时，优先用 candidate_schedules[0]，再兜底空骨架（便于联调）
 */
async function publish(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTaskPublisher(ctx, ctx.params.taskId);
  if (task.status === 'archived' || task.status === 'cancelled') {
    throw err('TASK_STATUS_INVALID', { message: '任务已结束，无法发布' });
  }

  let finalSchedule = ctx.body && ctx.body.finalSchedule;
  if (!finalSchedule || typeof finalSchedule !== 'object') {
    const candidates = task.candidateSchedules || [];
    finalSchedule = candidates[0] || {
      schemeName: '默认方案',
      assignments: [],
    };
  }
  const candidateSchedules = (ctx.body && ctx.body.candidateSchedules) || task.candidateSchedules || null;
  const assignments = deriveAssignments(finalSchedule, ctx.params.taskId);

  const repos = require('../repositories').getRepos();
  const shareToken = await repos.tasks.createShareToken(task.id, config.shareTokenTtl);
  const updated = await repos.tasks.publish(task.id, {
    finalSchedule,
    candidateSchedules,
    shareToken,
    assignments,
  });
  // 通知成员：站内 inbox 必达 + 微信订阅尽力发送
  const { notifyGroupMembers } = require('../services/notify-dispatch');
  await notifyGroupMembers(repos, {
    groupId: task.groupId,
    logicalKey: 'task_published',
    title: '排班已发布',
    body: `「${task.title || '排班任务'}」已发布，请查看并确认`,
    taskId: task.id,
    taskTitle: task.title,
  });
  return {
    task: updated,
    shareToken,
    previewUrl: `/share/tasks/${task.id}?token=${shareToken}`,
  };
}

/** POST /api/v1/tasks/{task_id}/deadline/extend */
async function extendDeadline(ctx) {
  const user = requireAuth(ctx);
  await requireTaskPublisher(ctx, ctx.params.taskId);
  const { deadline } = required(ctx.body, { deadline: { type: 'string', label: 'deadline' } });
  const repos = require('../repositories').getRepos();
  const task = await repos.tasks.extendDeadline(ctx.params.taskId, { deadline });
  if (!task) throw err('TASK_NOT_FOUND');
  // 重算截止调度（取消旧 pending，写新 reminder+deadline）
  if (repos.countdowns && repos.countdowns.replaceForTask) {
    const { buildCountdownPlan } = require('../domain/countdown');
    const plan = buildCountdownPlan(deadline, {
      reminderHours: config.deadlineReminderHours,
    });
    await repos.countdowns.replaceForTask(task.id, plan);
  }
  return { task };
}

/** POST /api/v1/tasks/{task_id}/cancel */
async function cancel(ctx) {
  const user = requireAuth(ctx);
  await requireTaskPublisher(ctx, ctx.params.taskId);
  const repos = require('../repositories').getRepos();
  const task = await repos.tasks.cancel(ctx.params.taskId);
  if (!task) throw err('TASK_NOT_FOUND');
  return { task };
}

/** POST /api/v1/tasks/{task_id}/adjust —— 异议处理后重新发布 */
async function adjust(ctx) {
  const user = requireAuth(ctx);
  const task = await requireTaskPublisher(ctx, ctx.params.taskId);
  const body = required(ctx.body, { finalSchedule: { type: 'object', label: 'finalSchedule' } });
  const repos = require('../repositories').getRepos();
  const assignments = deriveAssignments(body.finalSchedule, ctx.params.taskId);
  // publish 内部会把当前 final 备份到 previous_schedule，再写入新方案，保证回滚链完整
  const result = await repos.tasks.publish(task.id, {
    finalSchedule: body.finalSchedule,
    candidateSchedules: task.candidateSchedules,
    shareToken: task.shareToken,
    assignments,
  });
  return { task: result, shareToken: task.shareToken };
}

function deriveAssignments(finalSchedule, taskId) {
  const list = (finalSchedule && finalSchedule.assignments) || [];
  const out = [];
  for (const a of list) {
    const uids = a.userIds || [];
    for (const uid of uids) out.push({ taskId, userId: uid, date: a.date, periodId: a.periodId });
  }
  return out;
}

module.exports = { create, listByGroup, getOne, generate, getJob, publish, extendDeadline, cancel, adjust };
