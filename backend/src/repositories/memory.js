'use strict';

/**
 * 内存版仓储实现（repository）。
 * 用途：
 *   1) 本地无数据库时直接跑通全链路（DB_MODE=memory）
 *   2) 单元测试注入，验证业务逻辑链与数据链（状态机/乐观锁/软删/分享 token/异步 job）
 * 所有方法签名与 mysql.js 完全一致，可无缝替换。
 *
 * 数据契约对齐《business-flows.md v3.5》表结构：
 *   users / groups / group_members / tasks / task_responses /
 *   user_assignments / task_receipts / personal_calendars /
 *   notify_inbox / payments_orders / schedule_jobs
 */

const crypto = require('crypto');

function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}
function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/**
 * 创建一个独立的内存仓储实例（每次调用得到全新 store，测试间互不污染）。
 */
function createMemoryRepos() {
  const store = {
    users: new Map(),
    groups: new Map(),
    members: new Map(), // key: groupId:userId
    tasks: new Map(),
    responses: new Map(), // key: taskId:userId
    assignments: [],
    receipts: new Map(), // key: taskId:userId
    calendars: new Map(), // key: userId
    inbox: new Map(),
    orders: new Map(),
    jobs: new Map(),
    shareTokens: new Map(), // token -> {taskId, expireAt}
    scheduleProfiles: new Map(), // id -> profile
    groupProfiles: new Map(), // groupId -> profile
    settings: {
      defaultTimeMode: 'section_range',
      defaultProfileId: 'sys_uni_45min_v1',
    },
    seq: { user: 0, group: 0, task: 0, job: 0, msg: 0, order: 0, assign: 0 },
  };

  // 加载众数种子（幂等 upsert）
  try {
    const path = require('path');
    const fs = require('fs');
    const seedPath = path.resolve(__dirname, '../../seeds/schedule-profiles.seed.json');
    if (fs.existsSync(seedPath)) {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      for (const p of seed.profiles || []) {
        store.scheduleProfiles.set(p.id, Object.assign({ version: 1, scope: 'system' }, p));
      }
    }
  } catch (_) {
    /* 种子缺失时不阻断 memory 模式 */
  }

  // ---------- users ----------
  const users = {
    async upsertByOpenid(openid, profile = {}) {
      for (const u of store.users.values()) {
        if (u.openid === openid) {
          u.nickname = profile.nickname || u.nickname;
          u.avatarUrl = profile.avatarUrl || u.avatarUrl;
          u.updatedAt = new Date().toISOString();
          return clone(u);
        }
      }
      const id = 'u_' + ++store.seq.user;
      const user = {
        id,
        openid,
        accountType: 'wechat',
        nickname: profile.nickname || '微信用户',
        avatarUrl: profile.avatarUrl || '',
        phoneEnc: null,
        isBanned: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.users.set(id, user);
      return clone(user);
    },
    async getById(id) {
      const u = store.users.get(id);
      return u ? clone(u) : null;
    },
    async getByOpenid(openid) {
      for (const u of store.users.values()) if (u.openid === openid) return clone(u);
      return null;
    },
    async updateProfile(id, patch) {
      const u = store.users.get(id);
      if (!u) return null;
      if (patch.nickname !== undefined) u.nickname = patch.nickname;
      if (patch.avatarUrl !== undefined) u.avatarUrl = patch.avatarUrl;
      u.updatedAt = new Date().toISOString();
      return clone(u);
    },
    async getCalendar(userId) {
      const c = store.calendars.get(userId);
      return c ? clone(c) : null;
    },
    async upsertCalendar(userId, data) {
      const cal = {
        userId,
        semesterName: data.semesterName || '',
        cycleRule: data.cycleRule || 'weekly',
        slots: data.slots || [],
        source: data.source || 'manual',
        updatedAt: new Date().toISOString(),
      };
      store.calendars.set(userId, cal);
      return clone(cal);
    },
  };

  // ---------- groups ----------
  const groups = {
    async create(data) {
      const id = 'g_' + ++store.seq.group;
      const inviteCode = data.inviteCode || genCode(6);
      const group = {
        id,
        name: data.name,
        inviteCode,
        mode: data.mode || 'shift',
        timeConfig: data.timeConfig || null,
        cycleRule: data.cycleRule || 'weekly',
        templateStyle: data.templateStyle || 1,
        periods: data.periods || [],
        createdBy: data.createdBy,
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.groups.set(id, group);
      // 创建者自动成为 publisher
      store.members.set(id + ':' + data.createdBy, {
        groupId: id,
        userId: data.createdBy,
        roleInGroup: 'publisher',
        status: 'active',
        isBlacklisted: 0,
        joinedAt: new Date().toISOString(),
        leftAt: null,
        kickedAt: null,
        kickedReason: null,
      });
      return clone(group);
    },
    async getById(id) {
      const g = store.groups.get(id);
      return g ? clone(g) : null;
    },
    async getByInviteCode(code) {
      for (const g of store.groups.values()) if (g.inviteCode === code && g.status === 'active') return clone(g);
      return null;
    },
    async listByUserId(userId) {
      const result = [];
      for (const m of store.members.values()) {
        if (m.userId === userId && m.status === 'active') {
          const g = store.groups.get(m.groupId);
          if (g) {
            let memberCount = 0;
            let activeTaskCount = 0;
            let totalTasks = 0;
            for (const mm of store.members.values()) {
              if (mm.groupId === g.id && mm.status === 'active') memberCount++;
            }
            for (const t of store.tasks.values()) {
              if (t.groupId === g.id) {
                totalTasks++;
                if (['collecting', 'reviewing', 'adjusting', 'published'].includes(t.status)) activeTaskCount++;
              }
            }
            result.push(
              Object.assign(clone(g), {
                roleInGroup: m.roleInGroup,
                myRole: m.roleInGroup,
                memberCount,
                activeTaskCount,
                totalTasks,
              })
            );
          }
        }
      }
      return result;
    },
    async getMember(groupId, userId) {
      const m = store.members.get(groupId + ':' + userId);
      return m ? clone(m) : null;
    },
    async listMembers(groupId) {
      const result = [];
      for (const m of store.members.values()) {
        if (m.groupId === groupId && m.status === 'active') {
          const u = store.users.get(m.userId);
          result.push({
            userId: m.userId,
            nickname: u ? u.nickname : '未知',
            roleInGroup: m.roleInGroup,
            joinedAt: m.joinedAt,
          });
        }
      }
      return result;
    },
    async addMember(data) {
      const key = data.groupId + ':' + data.userId;
      const existing = store.members.get(key);
      if (existing) {
        // 软删除重入：恢复 active
        existing.status = 'active';
        existing.isBlacklisted = 0;
        existing.leftAt = null;
        existing.kickedAt = null;
        existing.kickedReason = null;
        existing.joinedAt = new Date().toISOString();
        return clone(existing);
      }
      const member = {
        groupId: data.groupId,
        userId: data.userId,
        roleInGroup: data.roleInGroup || 'member',
        status: 'active',
        isBlacklisted: 0,
        joinedAt: new Date().toISOString(),
        leftAt: null,
        kickedAt: null,
        kickedReason: null,
      };
      store.members.set(key, member);
      return clone(member);
    },
    async updateMember(groupId, userId, patch) {
      const m = store.members.get(groupId + ':' + userId);
      if (!m) return null;
      if (patch.status !== undefined) m.status = patch.status;
      if (patch.isBlacklisted !== undefined) m.isBlacklisted = patch.isBlacklisted;
      if (patch.kickedReason !== undefined) m.kickedReason = patch.kickedReason;
      if (patch.status === 'left') m.leftAt = new Date().toISOString();
      if (patch.status === 'kicked') m.kickedAt = new Date().toISOString();
      return clone(m);
    },
    async isBlacklisted(groupId, userId) {
      const m = store.members.get(groupId + ':' + userId);
      return !!(m && m.isBlacklisted === 1);
    },
    async countActiveTasks(groupId) {
      let n = 0;
      for (const t of store.tasks.values()) {
        if (t.groupId === groupId && ['collecting', 'reviewing', 'adjusting', 'published'].includes(t.status)) n++;
      }
      return n;
    },
  };

  // ---------- tasks + jobs ----------
  const tasks = {
    async create(data) {
      const id = 't_' + ++store.seq.task;
      const now = new Date().toISOString();
      const task = {
        id,
        groupId: data.groupId,
        publisherId: data.publisherId,
        title: data.title || '未命名任务',
        mode: data.mode || 'shift',
        timeMode: data.timeMode || store.settings.defaultTimeMode || 'section_range',
        periods: data.periods || [],
        scheduleProfileId: data.scheduleProfileId || null,
        scheduleProfileVersion: data.scheduleProfileVersion || null,
        constraints: data.constraints || { slotMinPeople: 1, maxShiftsPerWeek: null, maxShiftsPerDay: null },
        deadline: data.deadline || null,
        dateRangeStart: data.dateRangeStart || null,
        dateRangeEnd: data.dateRangeEnd || null,
        status: 'collecting',
        candidateSchedules: null,
        finalSchedule: null,
        previousSchedule: null,
        shareToken: null,
        generatingJobId: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      };
      store.tasks.set(id, task);
      return clone(task);
    },
    async getById(id) {
      const t = store.tasks.get(id);
      return t ? clone(t) : null;
    },
    async listByGroup(groupId, { status, page = 1, pageSize = 20 } = {}) {
      let list = [];
      for (const t of store.tasks.values()) if (t.groupId === groupId) list.push(t);
      if (status) list = list.filter((t) => t.status === status);
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const total = list.length;
      const start = (page - 1) * pageSize;
      let memberCount = 0;
      for (const m of store.members.values()) {
        if (m.groupId === groupId && m.status === 'active') memberCount++;
      }
      const pageList = list.slice(start, start + pageSize).map((t) => {
        let responseCount = 0;
        for (const r of store.responses.values()) {
          if (r.taskId === t.id && r.isValid !== 0) responseCount++;
        }
        return Object.assign(clone(t), { responseCount, memberCount });
      });
      return { list: pageList, total, page, pageSize };
    },
    /** 乐观锁更新：version 不匹配抛 CONFLICT */
    async updateWithVersion(id, patch, version) {
      const t = store.tasks.get(id);
      if (!t) return null;
      if (t.version !== version) {
        const e = new (require('../core/errors').ApiError)(
          1307,
          '数据已被他人更新，请刷新后重试',
          409
        );
        throw e;
      }
      Object.assign(t, patch, { version: t.version + 1, updatedAt: new Date().toISOString() });
      return clone(t);
    },
    async publish(taskId, { finalSchedule, candidateSchedules, shareToken, assignments }) {
      const t = store.tasks.get(taskId);
      if (!t) return null;
      t.previousSchedule = t.finalSchedule;
      t.finalSchedule = finalSchedule;
      t.candidateSchedules = candidateSchedules || null;
      t.shareToken = shareToken;
      t.status = 'published';
      t.publishedAt = new Date().toISOString();
      t.version += 1;
      // 写入分配快照
      for (const a of assignments || []) {
        store.assignments.push({
          id: 'a_' + ++store.seq.assign,
          taskId,
          userId: a.userId,
          date: a.date,
          periodId: a.periodId,
          isConfirmed: 0,
          isActive: 1,
          createdAt: new Date().toISOString(),
        });
      }
      return clone(t);
    },
    async extendDeadline(taskId, { deadline }) {
      const t = store.tasks.get(taskId);
      if (!t) return null;
      t.deadline = deadline;
      if (t.status === 'reviewing') t.status = 'collecting';
      t.version += 1;
      return clone(t);
    },
    async cancel(taskId) {
      const t = store.tasks.get(taskId);
      if (!t) return null;
      t.status = 'archived';
      t.version += 1;
      return clone(t);
    },
    async adjust(taskId, { finalSchedule }) {
      const t = store.tasks.get(taskId);
      if (!t) return null;
      t.previousSchedule = t.finalSchedule;
      t.finalSchedule = finalSchedule;
      t.status = 'published';
      t.version += 1;
      return clone(t);
    },
    async getByShareToken(token) {
      const info = store.shareTokens.get(token);
      if (!info) return null;
      if (info.expireAt < Date.now()) return { expired: true };
      const t = store.tasks.get(info.taskId);
      return t ? clone(t) : null;
    },
    async createShareToken(taskId, ttlSeconds) {
      const token = crypto.randomBytes(24).toString('hex');
      store.shareTokens.set(token, { taskId, expireAt: Date.now() + ttlSeconds * 1000 });
      return token;
    },
    async listAssignments(taskId, { activeOnly = true } = {}) {
      return store.assignments
        .filter((a) => a.taskId === taskId && (!activeOnly || a.isActive === 1))
        .map((a) => ({
          userId: a.userId,
          date: a.date,
          periodId: a.periodId,
          isConfirmed: a.isConfirmed,
          isActive: a.isActive,
          taskId: a.taskId,
        }));
    },
    async listAssignmentsByUser(userId, { activeOnly = true, month = null } = {}) {
      let list = store.assignments.filter(
        (a) => a.userId === userId && (!activeOnly || a.isActive === 1)
      );
      if (month) {
        // month: YYYY-MM
        list = list.filter((a) => String(a.date || '').startsWith(month));
      }
      return list.map((a) => {
        const t = store.tasks.get(a.taskId) || {};
        const g = store.groups.get(t.groupId) || {};
        return {
          taskId: a.taskId,
          userId: a.userId,
          date: a.date,
          periodId: a.periodId,
          isConfirmed: a.isConfirmed,
          isActive: a.isActive,
          taskTitle: t.title || '',
          groupId: t.groupId || null,
          groupName: g.name || '',
          taskStatus: t.status || '',
        };
      });
    },
    // jobs
    async createJob(data) {
      const id = 'j_' + ++store.seq.job;
      const job = {
        id,
        type: data.type,
        status: 'pending',
        progress: 0,
        payload: data.payload || {},
        result: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.jobs.set(id, job);
      return clone(job);
    },
    async getJob(id) {
      const j = store.jobs.get(id);
      return j ? clone(j) : null;
    },
    async updateJob(id, patch) {
      const j = store.jobs.get(id);
      if (!j) return null;
      Object.assign(j, patch, { updatedAt: new Date().toISOString() });
      return clone(j);
    },
  };

  // ---------- responses ----------
  const responses = {
    async upsert(data) {
      const key = data.taskId + ':' + data.userId;
      const existing = store.responses.get(key);
      if (existing) {
        existing.availableSlots = data.availableSlots;
        existing.source = data.source || existing.source;
        existing.isValid = 1;
        existing.updatedAt = new Date().toISOString();
        return clone(existing);
      }
      const r = {
        id: 'r_' + crypto.randomBytes(6).toString('hex'),
        taskId: data.taskId,
        userId: data.userId,
        availableSlots: data.availableSlots || [],
        source: data.source || 'manual',
        isValid: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.responses.set(key, r);
      return clone(r);
    },
    async get(taskId, userId) {
      const r = store.responses.get(taskId + ':' + userId);
      return r ? clone(r) : null;
    },
    async listByTask(taskId) {
      const result = [];
      for (const r of store.responses.values()) if (r.taskId === taskId && r.isValid === 1) result.push(clone(r));
      return result;
    },
  };

  // ---------- receipts ----------
  const receipts = {
    async upsert(data) {
      const key = data.taskId + ':' + data.userId;
      const existing = store.receipts.get(key);
      if (existing) {
        if (existing.resolved === 1) {
          const e = new (require('../core/errors').ApiError)(1502, '该异议已处理', 409);
          throw e;
        }
        existing.receiptStatus = data.receiptStatus || existing.receiptStatus;
        existing.objectionReason = data.objectionReason || existing.objectionReason;
        existing.updatedAt = new Date().toISOString();
        return clone(existing);
      }
      const r = {
        id: 'rc_' + crypto.randomBytes(6).toString('hex'),
        taskId: data.taskId,
        userId: data.userId,
        receiptStatus: data.receiptStatus || 'objection',
        objectionReason: data.objectionReason || '',
        resolved: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.receipts.set(key, r);
      return clone(r);
    },
    async get(taskId, userId) {
      const r = store.receipts.get(taskId + ':' + userId);
      return r ? clone(r) : null;
    },
  };

  // ---------- notify ----------
  const notify = {
    async enqueue(data) {
      const id = 'm_' + ++store.seq.msg;
      const msg = {
        id,
        userId: data.userId,
        taskId: data.taskId || null,
        templateId: data.templateId || null,
        title: data.title || '',
        body: data.body || '',
        isRead: 0,
        createdAt: new Date().toISOString(),
      };
      store.inbox.set(id, msg);
      return clone(msg);
    },
    async listInbox(userId, { page = 1, pageSize = 20 } = {}) {
      let list = [];
      for (const m of store.inbox.values()) if (m.userId === userId) list.push(m);
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const total = list.length;
      const start = (page - 1) * pageSize;
      return { list: list.slice(start, start + pageSize).map(clone), total, page, pageSize };
    },
    async markRead(userId, messageId) {
      const m = store.inbox.get(messageId);
      if (!m || m.userId !== userId) return null;
      m.isRead = 1;
      return clone(m);
    },
    async countUnread(userId) {
      let n = 0;
      for (const m of store.inbox.values()) if (m.userId === userId && m.isRead === 0) n++;
      return n;
    },
  };

  // ---------- payments ----------
  const payments = {
    async createOrder(data) {
      const id = 'o_' + ++store.seq.order;
      const order = {
        id,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency || 'CNY',
        status: 'pending',
        channel: data.channel || 'wechat_mini',
        prepayId: 'prepay_' + crypto.randomBytes(8).toString('hex'),
        mwebUrl: data.channel === 'wechat_h5' ? 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=' + id : null,
        outTradeNo: id,
        createdAt: new Date().toISOString(),
        paidAt: null,
      };
      store.orders.set(id, order);
      return clone(order);
    },
    async getOrder(id) {
      const o = store.orders.get(id);
      return o ? clone(o) : null;
    },
    async updateOrder(id, patch) {
      const o = store.orders.get(id);
      if (!o) return null;
      Object.assign(o, patch);
      if (patch.status === 'paid' && !o.paidAt) o.paidAt = new Date().toISOString();
      return clone(o);
    },
    async listByUser(userId, { page = 1, pageSize = 20 } = {}) {
      let list = [];
      for (const o of store.orders.values()) if (o.userId === userId) list.push(o);
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const total = list.length;
      const start = (page - 1) * pageSize;
      return { list: list.slice(start, start + pageSize).map(clone), total, page, pageSize };
    },
  };

  // ---------- schedule profiles（系统种子 + 分组覆盖） ----------
  const scheduleProfiles = {
    async listSystem({ status = 'active' } = {}) {
      const list = [];
      for (const p of store.scheduleProfiles.values()) {
        if (p.scope === 'group') continue;
        if (status && p.status && p.status !== status) continue;
        list.push(clone(p));
      }
      list.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
      });
      return list;
    },
    async getById(id) {
      const p = store.scheduleProfiles.get(id);
      return p ? clone(p) : null;
    },
    async getDefault() {
      for (const p of store.scheduleProfiles.values()) {
        if (p.isDefault && p.status !== 'archived') return clone(p);
      }
      const first = store.scheduleProfiles.values().next().value;
      return first ? clone(first) : null;
    },
    async getGroupProfile(groupId) {
      const p = store.groupProfiles.get(groupId);
      return p ? clone(p) : null;
    },
    async upsertGroupProfile(groupId, data) {
      const prev = store.groupProfiles.get(groupId);
      const profile = {
        id: (data && data.id) || (prev && prev.id) || 'grp_' + groupId,
        name: (data && data.name) || (prev && prev.name) || '分组作息',
        scope: 'group',
        groupId,
        slots: (data && data.slots) || (prev && prev.slots) || [],
        version: prev ? (prev.version || 1) + 1 : 1,
        status: 'active',
        sourceProfileId: (data && data.sourceProfileId) || (prev && prev.sourceProfileId) || null,
        updatedAt: new Date().toISOString(),
      };
      store.groupProfiles.set(groupId, profile);
      return clone(profile);
    },
    async importToGroup(groupId, systemProfileId) {
      const src = store.scheduleProfiles.get(systemProfileId);
      if (!src) return null;
      return this.upsertGroupProfile(groupId, {
        name: src.name + '（分组）',
        slots: src.slots,
        sourceProfileId: src.id,
      });
    },
    getSettings() {
      return clone(store.settings);
    },
    updateSettings(patch) {
      Object.assign(store.settings, patch || {});
      return clone(store.settings);
    },
  };

  return { users, groups, tasks, responses, receipts, notify, payments, scheduleProfiles };
}

module.exports = { createMemoryRepos };
