'use strict';

/**
 * 时段元数据 & 系统作息模板（P0：读种子 + 公开常量）
 * H5 写接口 P2 再补；此处保证小程序/联调可读。
 */

const { getTimeConstants } = require('../domain/time');
const { err } = require('../core/errors');
const { requireAuth, requireGroupMember, requireGroupPublisher } = require('./guard');

/** GET /api/v1/meta/time-constants — 无需登录也可，便于启动缓存 */
async function getTimeMeta(ctx) {
  return getTimeConstants();
}

/** GET /api/v1/schedule-profiles — 系统模板列表（登录） */
async function listProfiles(ctx) {
  requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  // mysql 启动灌种可能异步，尽量等一下
  if (require('../repositories').ready) {
    await require('../repositories').ready().catch(() => null);
  }
  const list = await repos.scheduleProfiles.listSystem({ status: 'active' });
  let settings = { defaultTimeMode: 'section_range', defaultProfileId: 'sys_uni_45min_v1' };
  try {
    if (typeof repos.scheduleProfiles.getSettings === 'function') {
      const s = repos.scheduleProfiles.getSettings();
      settings = s && typeof s.then === 'function' ? await s : s || settings;
    }
  } catch (_) {}
  return { list, settings };
}

/** GET /api/v1/schedule-profiles/{id} */
async function getProfile(ctx) {
  requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  const profile = await repos.scheduleProfiles.getById(ctx.params.profileId);
  if (!profile) throw err('NOT_FOUND', { message: '作息模板不存在' });
  return { profile };
}

/** GET /api/v1/groups/{groupId}/schedule-profile */
async function getGroupProfile(ctx) {
  requireAuth(ctx);
  await requireGroupMember(ctx, ctx.params.groupId);
  const repos = require('../repositories').getRepos();
  let profile = await repos.scheduleProfiles.getGroupProfile(ctx.params.groupId);
  if (!profile) {
    // 未配置时回落系统默认，不自动写库
    profile = await repos.scheduleProfiles.getDefault();
    return { profile, inherited: true };
  }
  return { profile, inherited: false };
}

/** POST /api/v1/groups/{groupId}/schedule-profile/import { profileId } */
async function importGroupProfile(ctx) {
  requireAuth(ctx);
  await requireGroupPublisher(ctx, ctx.params.groupId);
  const profileId = ctx.body && ctx.body.profileId;
  if (!profileId) throw err('VALIDATION_ERROR', { message: '缺少 profileId' });
  const repos = require('../repositories').getRepos();
  const profile = await repos.scheduleProfiles.importToGroup(ctx.params.groupId, profileId);
  if (!profile) throw err('NOT_FOUND', { message: '系统模板不存在' });
  return { profile };
}

/** PUT /api/v1/groups/{groupId}/schedule-profile { name?, slots } */
async function putGroupProfile(ctx) {
  requireAuth(ctx);
  await requireGroupPublisher(ctx, ctx.params.groupId);
  const slots = ctx.body && ctx.body.slots;
  if (!Array.isArray(slots) || !slots.length) {
    throw err('VALIDATION_ERROR', { message: 'slots 不能为空' });
  }
  const repos = require('../repositories').getRepos();
  const profile = await repos.scheduleProfiles.upsertGroupProfile(ctx.params.groupId, {
    name: ctx.body.name,
    slots,
    sourceProfileId: ctx.body.sourceProfileId,
  });
  return { profile };
}

module.exports = {
  getTimeMeta,
  listProfiles,
  getProfile,
  getGroupProfile,
  importGroupProfile,
  putGroupProfile,
};
