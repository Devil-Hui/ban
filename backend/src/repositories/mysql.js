'use strict';

/**
 * MySQL 版仓储实现（生产/联调环境，DB_MODE=mysql）。
 * 方法签名、入参 shape、返回字段与 memory.js 完全一致（memory.js 是唯一契约真相源），
 * 表结构与 schema.sql 一一对应。
 * 使用 mysql2/promise 连接池；JSON 字段手动序列化/反序列化以保证可移植。
 */

const { ApiError } = require('../core/errors');

function jparse(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch (_) {
      return v;
    }
  }
  return v;
}
function jstr(v) {
  return v === null || v === undefined ? null : JSON.stringify(v);
}

async function withTx(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('START TRANSACTION');
    const r = await fn(conn);
    await conn.query('COMMIT');
    return r;
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  } finally {
    conn.release();
  }
}

function createMysqlRepos(pool) {
  // ---------- users ----------
  const users = {
    async upsertByOpenid(openid, profile = {}) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE openid = ?', [openid]);
      if (rows.length) {
        await pool.execute(
          'UPDATE users SET nickname = ?, avatar_url = ?, updated_at = NOW() WHERE id = ?',
          [profile.nickname || rows[0].nickname, profile.avatarUrl || rows[0].avatar_url, rows[0].id]
        );
        return this.getById(rows[0].id);
      }
      const [res] = await pool.execute(
        'INSERT INTO users (openid, account_type, nickname, avatar_url) VALUES (?, ?, ?, ?)',
        [openid, 'wechat', profile.nickname || '微信用户', profile.avatarUrl || '']
      );
      return this.getById(res.insertId);
    },
    async getById(id) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
      if (!rows.length) return null;
      const u = rows[0];
      return {
        id: u.id,
        openid: u.openid,
        accountType: u.account_type,
        nickname: u.nickname,
        avatarUrl: u.avatar_url,
        phoneEnc: u.phone_enc,
        isBanned: u.is_banned,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      };
    },
    async getByOpenid(openid) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE openid = ?', [openid]);
      if (!rows.length) return null;
      return this.getById(rows[0].id);
    },
    async updateProfile(id, patch) {
      const sets = [];
      const params = [];
      if (patch.nickname !== undefined) {
        sets.push('nickname = ?');
        params.push(patch.nickname);
      }
      if (patch.avatarUrl !== undefined) {
        sets.push('avatar_url = ?');
        params.push(patch.avatarUrl);
      }
      if (!sets.length) return this.getById(id);
      sets.push('updated_at = NOW()');
      params.push(id);
      await pool.execute('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?', params);
      return this.getById(id);
    },
    async getCalendar(userId) {
      const [rows] = await pool.execute('SELECT * FROM personal_calendars WHERE user_id = ?', [userId]);
      if (!rows.length) return null;
      const c = rows[0];
      return { userId: c.user_id, semesterName: c.semester_name, cycleRule: c.cycle_rule, slots: jparse(c.slots), source: c.source };
    },
    async upsertCalendar(userId, data) {
      await pool.execute(
        `INSERT INTO personal_calendars (user_id, semester_name, cycle_rule, slots, source, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE semester_name=VALUES(semester_name), cycle_rule=VALUES(cycle_rule), slots=VALUES(slots), source=VALUES(source), updated_at=NOW()`,
        [userId, data.semesterName || '', data.cycleRule || 'weekly', jstr(data.slots || []), data.source || 'manual']
      );
      return this.getCalendar(userId);
    },
  };

  // ---------- groups ----------
  const groups = {
    async create(data) {
      const [res] = await pool.execute(
        `INSERT INTO \`groups\` (name, invite_code, mode, time_config, cycle_rule, template_style, periods, created_by, status, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`,
        [
          data.name,
          data.inviteCode || '',
          data.mode || 'shift',
          jstr(data.timeConfig || null),
          data.cycleRule || 'weekly',
          data.templateStyle || 1,
          jstr(data.periods || []),
          data.createdBy,
        ]
      );
      await pool.execute(
        'INSERT INTO group_members (group_id, user_id, role_in_group, status, is_blacklisted, joined_at) VALUES (?, ?, ?, ?, 0, NOW())',
        [res.insertId, data.createdBy, 'publisher', 'active']
      );
      if (!data.inviteCode) {
        const code = Math.random().toString(36).slice(2, 8).toUpperCase();
        await pool.execute('UPDATE `groups` SET invite_code = ? WHERE id = ?', [code, res.insertId]);
      }
      return this.getById(res.insertId);
    },
    async getById(id) {
      const [rows] = await pool.execute('SELECT * FROM \`groups\` WHERE id = ?', [id]);
      if (!rows.length) return null;
      const g = rows[0];
      return {
        id: g.id,
        name: g.name,
        inviteCode: g.invite_code,
        mode: g.mode,
        timeConfig: jparse(g.time_config),
        cycleRule: g.cycle_rule,
        templateStyle: g.template_style,
        periods: jparse(g.periods),
        createdBy: g.created_by,
        status: g.status,
        version: g.version,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      };
    },
    async getByInviteCode(code) {
      const [rows] = await pool.execute('SELECT * FROM \`groups\` WHERE invite_code = ? AND status = ?', [code, 'active']);
      if (!rows.length) return null;
      return this.getById(rows[0].id);
    },
    async listByUserId(userId) {
      const [rows] = await pool.execute(
        `SELECT g.*, m.role_in_group FROM \`groups\` g
         JOIN group_members m ON m.group_id = g.id
         WHERE m.user_id = ? AND m.status = 'active'`,
        [userId]
      );
      const out = [];
      for (const g of rows) {
        const o = await this.getById(g.id);
        const [mc] = await pool.execute(
          "SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND status = 'active'",
          [g.id]
        );
        const [tc] = await pool.execute(
          "SELECT COUNT(*) AS c FROM tasks WHERE group_id = ? AND status IN ('collecting','reviewing','adjusting','published')",
          [g.id]
        );
        const [allT] = await pool.execute('SELECT COUNT(*) AS c FROM tasks WHERE group_id = ?', [g.id]);
        out.push(
          Object.assign(o, {
            roleInGroup: g.role_in_group,
            myRole: g.role_in_group,
            memberCount: mc[0].c,
            activeTaskCount: tc[0].c,
            totalTasks: allT[0].c,
          })
        );
      }
      return out;
    },
    async getMember(groupId, userId) {
      const [rows] = await pool.execute(
        'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      if (!rows.length) return null;
      const m = rows[0];
      return {
        groupId: m.group_id,
        userId: m.user_id,
        roleInGroup: m.role_in_group,
        status: m.status,
        isBlacklisted: m.is_blacklisted,
        joinedAt: m.joined_at,
        leftAt: m.left_at,
        kickedAt: m.kicked_at,
        kickedReason: m.kicked_reason,
      };
    },
    async listMembers(groupId) {
      const [rows] = await pool.execute(
        `SELECT m.*, u.nickname FROM group_members m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.group_id = ? AND m.status = 'active'`,
        [groupId]
      );
      return rows.map((m) => ({
        userId: m.user_id,
        nickname: m.nickname || '未知',
        roleInGroup: m.role_in_group,
        joinedAt: m.joined_at,
      }));
    },
    async addMember(data) {
      const existing = await this.getMember(data.groupId, data.userId);
      if (existing) {
        await pool.execute(
          `UPDATE group_members SET status='active', is_blacklisted=0, left_at=NULL, kicked_at=NULL, kicked_reason=NULL, joined_at=NOW()
           WHERE group_id=? AND user_id=?`,
          [data.groupId, data.userId]
        );
        return this.getMember(data.groupId, data.userId);
      }
      await pool.execute(
        'INSERT INTO group_members (group_id, user_id, role_in_group, status, is_blacklisted, joined_at) VALUES (?, ?, ?, ?, 0, NOW())',
        [data.groupId, data.userId, data.roleInGroup || 'member', 'active']
      );
      return this.getMember(data.groupId, data.userId);
    },
    async updateMember(groupId, userId, patch) {
      const sets = [];
      const params = [];
      if (patch.status !== undefined) {
        sets.push('status = ?');
        params.push(patch.status);
        if (patch.status === 'left') sets.push('left_at = NOW()');
        if (patch.status === 'kicked') sets.push('kicked_at = NOW()');
      }
      if (patch.isBlacklisted !== undefined) {
        sets.push('is_blacklisted = ?');
        params.push(patch.isBlacklisted);
      }
      if (patch.kickedReason !== undefined) {
        sets.push('kicked_reason = ?');
        params.push(patch.kickedReason);
      }
      params.push(groupId, userId);
      await pool.execute('UPDATE group_members SET ' + sets.join(', ') + ' WHERE group_id = ? AND user_id = ?', params);
      return this.getMember(groupId, userId);
    },
    async isBlacklisted(groupId, userId) {
      const m = await this.getMember(groupId, userId);
      return !!(m && m.isBlacklisted === 1);
    },
    async countActiveTasks(groupId) {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS c FROM tasks WHERE group_id = ? AND status IN ('collecting','reviewing','adjusting','published')",
        [groupId]
      );
      return rows[0].c;
    },
  };

  // ---------- tasks + jobs ----------
  const tasks = {
    async create(data) {
      const [res] = await pool.execute(
        `INSERT INTO tasks (group_id, publisher_id, title, mode, time_mode, schedule_profile_id, schedule_profile_version, periods, constraints, deadline, date_range_start, date_range_end, status, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'collecting', 1)`,
        [
          data.groupId,
          data.publisherId,
          data.title || '未命名任务',
          data.mode || 'shift',
          data.timeMode || 'section_range',
          data.scheduleProfileId || null,
          data.scheduleProfileVersion != null ? data.scheduleProfileVersion : null,
          jstr(data.periods || []),
          jstr(data.constraints || { slotMinPeople: 1, maxShiftsPerWeek: null, maxShiftsPerDay: null }),
          data.deadline || null,
          data.dateRangeStart || null,
          data.dateRangeEnd || null,
        ]
      );
      return this.getById(res.insertId);
    },
    async getById(id, conn) {
      const exe = conn || pool;
      const [rows] = await exe.execute('SELECT * FROM tasks WHERE id = ?', [id]);
      if (!rows.length) return null;
      const t = rows[0];
      return {
        id: t.id,
        groupId: t.group_id,
        publisherId: t.publisher_id,
        title: t.title,
        mode: t.mode,
        timeMode: t.time_mode || 'section_range',
        scheduleProfileId: t.schedule_profile_id || null,
        scheduleProfileVersion: t.schedule_profile_version != null ? t.schedule_profile_version : null,
        periods: jparse(t.periods),
        constraints: jparse(t.constraints),
        deadline: t.deadline,
        dateRangeStart: t.date_range_start,
        dateRangeEnd: t.date_range_end,
        status: t.status,
        candidateSchedules: jparse(t.candidate_schedules),
        finalSchedule: jparse(t.final_schedule),
        previousSchedule: jparse(t.previous_schedule),
        shareToken: t.share_token,
        generatingJobId: t.generating_job_id,
        version: t.version,
        publishedAt: t.published_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    },
    async listByGroup(groupId, { status, page = 1, pageSize = 20 } = {}) {
      const where = ['group_id = ?'];
      const params = [groupId];
      if (status) {
        where.push('status = ?');
        params.push(status);
      }
      const [countRows] = await pool.execute('SELECT COUNT(*) AS c FROM tasks WHERE ' + where.join(' AND '), params);
      const limit = Math.max(1, Math.floor(pageSize));
      const offset = Math.max(0, Math.floor((page - 1) * pageSize));
      const [rows] = await pool.query(
        'SELECT * FROM tasks WHERE ' + where.join(' AND ') + ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      // 成员数一次查
      const [mc] = await pool.execute(
        "SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND status = 'active'",
        [groupId]
      );
      const memberCount = mc[0].c;
      const list = [];
      for (const r of rows) {
        const task = await this.getById(r.id);
        const [rc] = await pool.execute(
          'SELECT COUNT(*) AS c FROM task_responses WHERE task_id = ? AND is_valid = 1',
          [r.id]
        );
        list.push(
          Object.assign(task, {
            responseCount: rc[0].c,
            memberCount,
          })
        );
      }
      return { list, total: countRows[0].c, page, pageSize };
    },
    async updateWithVersion(id, patch, version) {
      const sets = [];
      const params = [];
      const map = {
        status: 'status',
        finalSchedule: 'final_schedule',
        candidateSchedules: 'candidate_schedules',
        previousSchedule: 'previous_schedule',
        shareToken: 'share_token',
        generatingJobId: 'generating_job_id',
        deadline: 'deadline',
      };
      for (const k of Object.keys(patch)) {
        if (map[k]) {
          sets.push(map[k] + ' = ?');
          params.push(k === 'finalSchedule' || k === 'candidateSchedules' || k === 'previousSchedule' ? jstr(patch[k]) : patch[k]);
        }
      }
      sets.push('version = version + 1');
      sets.push('updated_at = NOW()');
      // WHERE id=? AND version=? 绑定顺序必须是 id, version
      params.push(id, version);
      const [res] = await pool.execute(
        'UPDATE tasks SET ' + sets.join(', ') + ' WHERE id = ? AND version = ?',
        params
      );
      if (res.affectedRows === 0) {
        throw new ApiError(1307, '数据已被他人更新，请刷新后重试', 409);
      }
      return this.getById(id);
    },
    async publish(taskId, { finalSchedule, candidateSchedules, shareToken, assignments }) {
      return withTx(pool, async (conn) => {
        const [rows] = await conn.execute('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
        if (!rows.length) return null;
        await conn.execute(
          `UPDATE tasks SET previous_schedule = final_schedule, final_schedule = ?, candidate_schedules = ?, share_token = ?, status = 'published', published_at = NOW(), version = version + 1, updated_at = NOW()
           WHERE id = ?`,
          [jstr(finalSchedule), jstr(candidateSchedules || null), shareToken, taskId]
        );
        // 失效旧分配
        await conn.execute('UPDATE user_assignments SET is_active = 0 WHERE task_id = ?', [taskId]);
        for (const a of assignments || []) {
          await conn.execute(
            'INSERT INTO user_assignments (task_id, user_id, date, period_id, is_confirmed, is_active) VALUES (?, ?, ?, ?, 0, 1)',
            [taskId, a.userId, a.date, a.periodId]
          );
        }
        return this.getById(taskId, conn);
      });
    },
    async extendDeadline(taskId, { deadline }) {
      const [res] = await pool.execute(
        "UPDATE tasks SET deadline = ?, status = CASE WHEN status='reviewing' THEN 'collecting' ELSE status END, version = version + 1, updated_at = NOW() WHERE id = ?",
        [deadline, taskId]
      );
      if (!res.affectedRows) return null;
      return this.getById(taskId);
    },
    async cancel(taskId) {
      const [res] = await pool.execute(
        "UPDATE tasks SET status = 'archived', version = version + 1, updated_at = NOW() WHERE id = ?",
        [taskId]
      );
      if (!res.affectedRows) return null;
      return this.getById(taskId);
    },
    async adjust(taskId, { finalSchedule }) {
      const [res] = await pool.execute(
        'UPDATE tasks SET previous_schedule = final_schedule, final_schedule = ?, status = ?, version = version + 1, updated_at = NOW() WHERE id = ?',
        [jstr(finalSchedule), 'published', taskId]
      );
      if (!res.affectedRows) return null;
      return this.getById(taskId);
    },
    async getByShareToken(token) {
      const [rows] = await pool.execute('SELECT * FROM tasks WHERE share_token = ?', [token]);
      if (!rows.length) return null;
      return this.getById(rows[0].id);
    },
    async createShareToken(taskId, ttlSeconds) {
      const token = require('crypto').randomBytes(24).toString('hex');
      await pool.execute('UPDATE tasks SET share_token = ? WHERE id = ?', [token, taskId]);
      return token;
    },
    async listAssignments(taskId, { activeOnly = true } = {}) {
      const where = ['task_id = ?'];
      const params = [taskId];
      if (activeOnly) {
        where.push('is_active = 1');
      }
      const [rows] = await pool.execute('SELECT * FROM user_assignments WHERE ' + where.join(' AND '), params);
      return rows.map((a) => ({
        taskId: a.task_id,
        userId: a.user_id,
        date: a.date,
        periodId: a.period_id,
        isConfirmed: a.is_confirmed,
        isActive: a.is_active,
      }));
    },
    async listAssignmentsByUser(userId, { activeOnly = true, month = null } = {}) {
      const where = ['a.user_id = ?'];
      const params = [userId];
      if (activeOnly) {
        where.push('a.is_active = 1');
      }
      if (month) {
        where.push("DATE_FORMAT(a.date, '%Y-%m') = ?");
        params.push(month);
      }
      const [rows] = await pool.execute(
        `SELECT a.*, t.title AS task_title, t.group_id, t.status AS task_status, g.name AS group_name
         FROM user_assignments a
         LEFT JOIN tasks t ON t.id = a.task_id
         LEFT JOIN \`groups\` g ON g.id = t.group_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.date ASC, a.period_id ASC`,
        params
      );
      return rows.map((a) => ({
        taskId: a.task_id,
        userId: a.user_id,
        date: a.date,
        periodId: a.period_id,
        isConfirmed: a.is_confirmed,
        isActive: a.is_active,
        taskTitle: a.task_title || '',
        groupId: a.group_id || null,
        groupName: a.group_name || '',
        taskStatus: a.task_status || '',
      }));
    },
    async createJob(data) {
      const [res] = await pool.execute(
        'INSERT INTO schedule_jobs (type, status, progress, payload) VALUES (?, ?, 0, ?)',
        [data.type, 'pending', jstr(data.payload || {})]
      );
      return this.getJob(res.insertId);
    },
    async getJob(id) {
      const [rows] = await pool.execute('SELECT * FROM schedule_jobs WHERE id = ?', [id]);
      if (!rows.length) return null;
      const j = rows[0];
      return {
        id: j.id,
        type: j.type,
        status: j.status,
        progress: j.progress,
        payload: jparse(j.payload),
        result: jparse(j.result),
        error: j.error,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
      };
    },
    async updateJob(id, patch) {
      const sets = [];
      const params = [];
      if (patch.status !== undefined) {
        sets.push('status = ?');
        params.push(patch.status);
      }
      if (patch.progress !== undefined) {
        sets.push('progress = ?');
        params.push(patch.progress);
      }
      if (patch.result !== undefined) {
        sets.push('result = ?');
        params.push(jstr(patch.result));
      }
      if (patch.error !== undefined) {
        sets.push('error = ?');
        params.push(patch.error);
      }
      params.push(id);
      await pool.execute('UPDATE schedule_jobs SET ' + sets.join(', ') + ', updated_at = NOW() WHERE id = ?', params);
      return this.getJob(id);
    },
  };

  // ---------- responses ----------
  const responses = {
    async upsert(data) {
      const [rows] = await pool.execute(
        'SELECT * FROM task_responses WHERE task_id = ? AND user_id = ?',
        [data.taskId, data.userId]
      );
      if (rows.length) {
        await pool.execute(
          'UPDATE task_responses SET available_slots = ?, source = ?, is_valid = 1, updated_at = NOW() WHERE id = ?',
          [jstr(data.availableSlots || []), data.source || 'manual', rows[0].id]
        );
        return this.get(data.taskId, data.userId);
      }
      const [res] = await pool.execute(
        'INSERT INTO task_responses (task_id, user_id, available_slots, source, is_valid) VALUES (?, ?, ?, ?, 1)',
        [data.taskId, data.userId, jstr(data.availableSlots || []), data.source || 'manual']
      );
      return this.get(data.taskId, data.userId);
    },
    async get(taskId, userId) {
      const [rows] = await pool.execute(
        'SELECT * FROM task_responses WHERE task_id = ? AND user_id = ?',
        [taskId, userId]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return { id: r.id, taskId: r.task_id, userId: r.user_id, availableSlots: jparse(r.available_slots), source: r.source, isValid: r.is_valid };
    },
    async listByTask(taskId) {
      const [rows] = await pool.execute('SELECT * FROM task_responses WHERE task_id = ? AND is_valid = 1', [taskId]);
      return rows.map((r) => ({
        id: r.id,
        taskId: r.task_id,
        userId: r.user_id,
        availableSlots: jparse(r.available_slots),
        source: r.source,
        isValid: r.is_valid,
      }));
    },
  };

  // ---------- receipts ----------
  const receipts = {
    async upsert(data) {
      const [rows] = await pool.execute(
        'SELECT * FROM task_receipts WHERE task_id = ? AND user_id = ?',
        [data.taskId, data.userId]
      );
      if (rows.length) {
        if (rows[0].resolved === 1) throw new ApiError(1502, '该异议已处理', 409);
        await pool.execute(
          'UPDATE task_receipts SET receipt_status = ?, objection_reason = ?, updated_at = NOW() WHERE id = ?',
          [data.receiptStatus || 'objection', data.objectionReason || '', rows[0].id]
        );
        return this.get(data.taskId, data.userId);
      }
      const [res] = await pool.execute(
        'INSERT INTO task_receipts (task_id, user_id, receipt_status, objection_reason, resolved) VALUES (?, ?, ?, ?, 0)',
        [data.taskId, data.userId, data.receiptStatus || 'objection', data.objectionReason || '']
      );
      return this.get(data.taskId, data.userId);
    },
    async get(taskId, userId) {
      const [rows] = await pool.execute(
        'SELECT * FROM task_receipts WHERE task_id = ? AND user_id = ?',
        [taskId, userId]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        taskId: r.task_id,
        userId: r.user_id,
        receiptStatus: r.receipt_status,
        objectionReason: r.objection_reason,
        resolved: r.resolved,
      };
    },
  };

  // ---------- notify ----------
  const notify = {
    async enqueue(data) {
      const [res] = await pool.execute(
        'INSERT INTO notify_inbox (user_id, task_id, template_id, title, body) VALUES (?, ?, ?, ?, ?)',
        [data.userId, data.taskId || null, data.templateId || null, data.title || '', data.body || '']
      );
      const [rows] = await pool.execute('SELECT * FROM notify_inbox WHERE id = ?', [res.insertId]);
      const m = rows[0];
      return {
        id: m.id,
        userId: m.user_id,
        taskId: m.task_id,
        templateId: m.template_id,
        title: m.title,
        body: m.body,
        isRead: m.is_read,
        createdAt: m.created_at,
      };
    },
    async listInbox(userId, { page = 1, pageSize = 20 } = {}) {
      const [countRows] = await pool.execute('SELECT COUNT(*) AS c FROM notify_inbox WHERE user_id = ?', [userId]);
      const [rows] = await pool.query(
        'SELECT * FROM notify_inbox WHERE user_id = ? ORDER BY created_at DESC LIMIT ' + Math.floor(pageSize) + ' OFFSET ' + Math.floor((page - 1) * pageSize),
        [userId]
      );
      return {
        list: rows.map((m) => ({
          id: m.id,
          userId: m.user_id,
          taskId: m.task_id,
          templateId: m.template_id,
          title: m.title,
          body: m.body,
          isRead: m.is_read,
          createdAt: m.created_at,
        })),
        total: countRows[0].c,
        page,
        pageSize,
      };
    },
    async markRead(userId, messageId) {
      const [res] = await pool.execute(
        'UPDATE notify_inbox SET is_read = 1 WHERE id = ? AND user_id = ?',
        [messageId, userId]
      );
      if (!res.affectedRows) return null;
      const [rows] = await pool.execute('SELECT * FROM notify_inbox WHERE id = ?', [messageId]);
      const m = rows[0];
      return {
        id: m.id,
        userId: m.user_id,
        taskId: m.task_id,
        templateId: m.template_id,
        title: m.title,
        body: m.body,
        isRead: m.is_read,
      };
    },
    async countUnread(userId) {
      const [rows] = await pool.execute('SELECT COUNT(*) AS c FROM notify_inbox WHERE user_id = ? AND is_read = 0', [userId]);
      return rows[0].c;
    },
  };

  // ---------- payments ----------
  const payments = {
    async createOrder(data) {
      const outTradeNo = 'O' + Date.now() + Math.floor(Math.random() * 1000);
      const [res] = await pool.execute(
        'INSERT INTO payments_orders (out_trade_no, user_id, amount, currency, status, channel, prepay_id, mweb_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          outTradeNo,
          data.userId,
          data.amount,
          data.currency || 'CNY',
          'pending',
          data.channel || 'wechat_mini',
          'prepay_' + outTradeNo,
          data.channel === 'wechat_h5' ? 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=' + outTradeNo : null,
        ]
      );
      return this.getOrder(res.insertId);
    },
    async getOrder(id) {
      const [rows] = await pool.execute('SELECT * FROM payments_orders WHERE id = ?', [id]);
      if (!rows.length) return null;
      const o = rows[0];
      return {
        id: o.id,
        userId: o.user_id,
        amount: o.amount,
        currency: o.currency,
        status: o.status,
        channel: o.channel,
        prepayId: o.prepay_id,
        mwebUrl: o.mweb_url,
        outTradeNo: o.out_trade_no,
        createdAt: o.created_at,
        paidAt: o.paid_at,
      };
    },
    async updateOrder(id, patch) {
      const sets = [];
      const params = [];
      if (patch.status !== undefined) {
        sets.push('status = ?');
        params.push(patch.status);
      }
      if (patch.status === 'paid') sets.push('paid_at = NOW()');
      params.push(id);
      await pool.execute('UPDATE payments_orders SET ' + sets.join(', ') + ' WHERE id = ?', params);
      return this.getOrder(id);
    },
    async listByUser(userId, { page = 1, pageSize = 20 } = {}) {
      const [countRows] = await pool.execute('SELECT COUNT(*) AS c FROM payments_orders WHERE user_id = ?', [userId]);
      const [rows] = await pool.query(
        'SELECT * FROM payments_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ' + Math.floor(pageSize) + ' OFFSET ' + Math.floor((page - 1) * pageSize),
        [userId]
      );
      return {
        list: rows.map((o) => ({ id: o.id, amount: o.amount, status: o.status, channel: o.channel, createdAt: o.created_at })),
        total: countRows[0].c,
        page,
        pageSize,
      };
    },
  };

  // ---------- schedule profiles ----------
  const scheduleProfiles = {
    async listSystem({ status = 'active' } = {}) {
      const params = ['system'];
      let sql = "SELECT * FROM schedule_profiles WHERE scope = ?";
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      sql += ' ORDER BY is_default DESC, name ASC';
      const [rows] = await pool.execute(sql, params);
      return rows.map(mapProfileRow);
    },
    async getById(id) {
      const [rows] = await pool.execute('SELECT * FROM schedule_profiles WHERE id = ?', [id]);
      if (!rows.length) return null;
      return mapProfileRow(rows[0]);
    },
    async getDefault() {
      const [rows] = await pool.execute(
        "SELECT * FROM schedule_profiles WHERE scope = 'system' AND status = 'active' ORDER BY is_default DESC LIMIT 1"
      );
      if (!rows.length) return null;
      return mapProfileRow(rows[0]);
    },
    async getGroupProfile(groupId) {
      const [rows] = await pool.execute(
        "SELECT * FROM schedule_profiles WHERE scope = 'group' AND group_id = ? AND status = 'active' LIMIT 1",
        [groupId]
      );
      if (!rows.length) return null;
      return mapProfileRow(rows[0]);
    },
    async upsertGroupProfile(groupId, data) {
      const id = (data && data.id) || 'grp_' + groupId;
      const existing = await this.getById(id);
      const version = existing ? (existing.version || 1) + 1 : 1;
      const slots = (data && data.slots) || (existing && existing.slots) || [];
      const name = (data && data.name) || (existing && existing.name) || '分组作息';
      const sourceProfileId =
        (data && data.sourceProfileId) || (existing && existing.sourceProfileId) || null;
      await pool.execute(
        `INSERT INTO schedule_profiles (id, name, scope, group_id, slots, version, status, is_default, source_profile_id)
         VALUES (?, ?, 'group', ?, ?, ?, 'active', 0, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), slots = VALUES(slots), version = VALUES(version),
           source_profile_id = VALUES(source_profile_id), status = 'active', updated_at = NOW()`,
        [id, name, groupId, jstr(slots), version, sourceProfileId]
      );
      return this.getById(id);
    },
    async importToGroup(groupId, systemProfileId) {
      const src = await this.getById(systemProfileId);
      if (!src || src.scope === 'group') return null;
      return this.upsertGroupProfile(groupId, {
        name: src.name + '（分组）',
        slots: src.slots,
        sourceProfileId: src.id,
      });
    },
    async getSettings() {
      const [rows] = await pool.execute('SELECT k, v FROM app_settings');
      const map = {
        defaultTimeMode: 'section_range',
        defaultProfileId: 'sys_uni_45min_v1',
      };
      for (const r of rows) map[r.k] = r.v;
      return map;
    },
    getSettings() {
      // sync facade used by handlers (memory has sync getSettings)
      // mysql path is async-only; handler will await getSettingsAsync if present
      return {
        defaultTimeMode: 'section_range',
        defaultProfileId: 'sys_uni_45min_v1',
      };
    },
    async updateSettings(patch) {
      for (const k of Object.keys(patch || {})) {
        await pool.execute(
          `INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = NOW()`,
          [k, String(patch[k])]
        );
      }
      return this.getSettings();
    },
    /** 幂等导入种子 */
    async ensureSeeds(seedProfiles) {
      for (const p of seedProfiles || []) {
        await pool.execute(
          `INSERT INTO schedule_profiles (id, name, scope, group_id, slots, version, status, is_default, description, locale, tags)
           VALUES (?, ?, 'system', NULL, ?, 1, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), slots = VALUES(slots), status = VALUES(status),
             is_default = VALUES(is_default), description = VALUES(description), updated_at = NOW()`,
          [
            p.id,
            p.name,
            jstr(p.slots || []),
            p.status || 'active',
            p.isDefault ? 1 : 0,
            p.description || null,
            p.locale || 'zh-CN',
            jstr(p.tags || null),
          ]
        );
      }
    },
  };

  function mapProfileRow(p) {
    return {
      id: p.id,
      name: p.name,
      scope: p.scope,
      groupId: p.group_id,
      slots: jparse(p.slots) || [],
      version: p.version,
      status: p.status,
      isDefault: !!p.is_default,
      description: p.description,
      sourceProfileId: p.source_profile_id,
      locale: p.locale,
      tags: jparse(p.tags),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  return { users, groups, tasks, responses, receipts, notify, payments, scheduleProfiles };
}

module.exports = { createMysqlRepos };
