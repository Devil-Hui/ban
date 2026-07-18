// utils/local-db.js — 纯本地数据层（不连后端）
// 数据落在 wx.storage，刷新后仍在；适合 UI 联调与演示。
// 打开 config.useLocalMock = true 后由 request.js 自动走这里。

const KEY = 'paiban_local_db_v1';

function load() {
  try {
    const raw = wx.getStorageSync(KEY);
    if (raw && typeof raw === 'object') return raw;
  } catch (_) {}
  return {
    seq: { user: 1, group: 1, task: 1, job: 1 },
    users: {},
    groups: {},
    members: {}, // groupId:userId
    tasks: {},
    responses: {}, // taskId:userId
    jobs: {},
    currentUserId: null,
  };
}

function save(db) {
  try {
    wx.setStorageSync(KEY, db);
  } catch (_) {}
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function ensureUser(db, profile) {
  if (db.currentUserId && db.users[db.currentUserId]) {
    const u = db.users[db.currentUserId];
    if (profile && profile.nickname) u.nickname = profile.nickname;
    if (profile && profile.avatarUrl) u.avatarUrl = profile.avatarUrl;
    return u;
  }
  const id = 'u_' + db.seq.user++;
  const user = {
    id,
    nickname: (profile && profile.nickname) || '本地用户',
    avatarUrl: (profile && profile.avatarUrl) || '',
    role: 'user',
  };
  db.users[id] = user;
  db.currentUserId = id;
  return user;
}

function issueTokens(userId) {
  return {
    accessToken: 'local_' + userId + '_' + Date.now(),
    refreshToken: 'local_rf_' + userId,
    tokenType: 'Bearer',
    expiresIn: 86400,
  };
}

function getMe(db) {
  const u = db.users[db.currentUserId];
  return u ? { user: clone(u) } : null;
}

function listMyGroups(db) {
  const uid = db.currentUserId;
  const list = [];
  Object.keys(db.members).forEach((k) => {
    const m = db.members[k];
    if (m.userId === uid && m.status === 'active') {
      const g = db.groups[m.groupId];
      if (g) {
        list.push(
          Object.assign(clone(g), {
            roleInGroup: m.roleInGroup,
            myRole: m.roleInGroup,
            role: m.roleInGroup,
          })
        );
      }
    }
  });
  return list;
}

function loadSeedProfiles() {
  try {
    const seed = require('../constants/schedule-profiles.seed.json');
    return (seed && seed.profiles) || [];
  } catch (_) {
    return [];
  }
}

/**
 * 路由本地 mock
 * @returns {{ ok: boolean, data?: any, code?: number, message?: string }}
 */
function handle(method, url, body) {
  const db = load();
  const m = (method || 'GET').toUpperCase();
  const path = String(url || '').split('?')[0];
  const q = String(url || '').includes('?') ? String(url).split('?')[1] : '';

  // —— 登录 ——
  if (m === 'POST' && path === '/auth/miniprogram/login') {
    const user = ensureUser(db, body);
    save(db);
    return { ok: true, data: Object.assign(issueTokens(user.id), { user: clone(user) }) };
  }
  if (m === 'POST' && path === '/auth/refresh') {
    const user = ensureUser(db);
    save(db);
    return { ok: true, data: issueTokens(user.id) };
  }
  if (m === 'GET' && path === '/users/me') {
    ensureUser(db);
    save(db);
    return { ok: true, data: getMe(db) };
  }
  if (m === 'PATCH' && path === '/users/me') {
    const u = ensureUser(db, body);
    save(db);
    return { ok: true, data: { user: clone(u) } };
  }

  // —— meta / profiles ——
  if (m === 'GET' && path === '/meta/time-constants') {
    const c = require('../constants/time');
    return {
      ok: true,
      data: {
        TIME_MODES: c.TIME_MODES,
        DEFAULT_TASK_TIME_MODE: c.DEFAULT_TASK_TIME_MODE,
        TIME_MODE_META: c.TIME_MODE_META,
      },
    };
  }
  if (m === 'GET' && path === '/schedule-profiles') {
    const list = loadSeedProfiles().filter((p) => p.status !== 'archived');
    return {
      ok: true,
      data: {
        list,
        settings: { defaultTimeMode: 'section_range', defaultProfileId: 'sys_uni_45min_v1' },
      },
    };
  }
  const profileMatch = path.match(/^\/schedule-profiles\/([^/]+)$/);
  if (m === 'GET' && profileMatch) {
    const p = loadSeedProfiles().find((x) => x.id === profileMatch[1]);
    if (!p) return { ok: false, code: 4040, message: '模板不存在' };
    return { ok: true, data: { profile: p } };
  }

  // —— groups ——
  if (m === 'GET' && path === '/groups') {
    ensureUser(db);
    return { ok: true, data: { groups: listMyGroups(db) } };
  }
  if (m === 'POST' && path === '/groups') {
    const user = ensureUser(db);
    const id = 'g_' + db.seq.group++;
    const group = {
      id,
      name: (body && body.name) || '未命名分组',
      inviteCode: genCode(),
      createdBy: user.id,
      status: 'active',
      cycleRule: (body && body.cycleRule) || 'weekly',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.groups[id] = group;
    db.members[id + ':' + user.id] = {
      groupId: id,
      userId: user.id,
      roleInGroup: 'publisher',
      status: 'active',
    };
    save(db);
    return { ok: true, data: { group: Object.assign(clone(group), { roleInGroup: 'publisher', myRole: 'publisher' }) } };
  }
  if (m === 'POST' && path === '/groups/join') {
    const user = ensureUser(db);
    const code = String((body && body.inviteCode) || '')
      .trim()
      .toUpperCase();
    let found = null;
    Object.keys(db.groups).forEach((id) => {
      if (db.groups[id].inviteCode === code) found = db.groups[id];
    });
    if (!found) return { ok: false, code: 1202, message: '邀请码无效' };
    const key = found.id + ':' + user.id;
    if (db.members[key] && db.members[key].status === 'active') {
      return { ok: false, code: 1203, message: '你已在该分组中' };
    }
    db.members[key] = {
      groupId: found.id,
      userId: user.id,
      roleInGroup: 'member',
      status: 'active',
    };
    save(db);
    return { ok: true, data: { group: clone(found), member: clone(db.members[key]) } };
  }
  const groupOne = path.match(/^\/groups\/([^/]+)$/);
  if (m === 'GET' && groupOne) {
    const g = db.groups[groupOne[1]];
    if (!g) return { ok: false, code: 1201, message: '分组不存在' };
    const mem = db.members[g.id + ':' + db.currentUserId];
    return {
      ok: true,
      data: {
        group: Object.assign(clone(g), {
          myRole: mem ? mem.roleInGroup : null,
          roleInGroup: mem ? mem.roleInGroup : null,
        }),
      },
    };
  }
  const membersPath = path.match(/^\/groups\/([^/]+)\/members$/);
  if (m === 'GET' && membersPath) {
    const gid = membersPath[1];
    const list = [];
    Object.keys(db.members).forEach((k) => {
      const mem = db.members[k];
      if (mem.groupId === gid && mem.status === 'active') {
        const u = db.users[mem.userId] || {};
        list.push({
          userId: mem.userId,
          nickname: u.nickname || '成员',
          roleInGroup: mem.roleInGroup,
          status: mem.status,
          joinedAt: mem.joinedAt || null,
        });
      }
    });
    return { ok: true, data: { members: list } };
  }
  const kickPath = path.match(/^\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (m === 'DELETE' && kickPath) {
    const key = kickPath[1] + ':' + kickPath[2];
    if (db.members[key]) db.members[key].status = 'kicked';
    save(db);
    return { ok: true, data: { member: db.members[key] || null } };
  }
  const leavePath = path.match(/^\/groups\/([^/]+)\/members\/leave$/);
  if (m === 'POST' && leavePath) {
    const key = leavePath[1] + ':' + db.currentUserId;
    if (db.members[key]) db.members[key].status = 'left';
    save(db);
    return { ok: true, data: { member: db.members[key] || null } };
  }

  // —— tasks ——
  const createTask = path.match(/^\/groups\/([^/]+)\/tasks$/);
  if (m === 'POST' && createTask) {
    const user = ensureUser(db);
    const gid = createTask[1];
    const mem = db.members[gid + ':' + user.id];
    if (!mem || mem.roleInGroup !== 'publisher') {
      return { ok: false, code: 1204, message: '仅分组发布者可执行该操作' };
    }
    let periods = (body && body.periods) || [];
    if (!periods.length) {
      const seeds = loadSeedProfiles();
      const pid = (body && body.scheduleProfileId) || 'sys_uni_45min_v1';
      const profile = seeds.find((p) => p.id === pid) || seeds[0];
      periods = (profile && profile.slots) || [];
    }
    const id = 't_' + db.seq.task++;
    const task = {
      id,
      groupId: gid,
      publisherId: user.id,
      title: (body && body.title) || '未命名任务',
      description: (body && body.description) || '',
      timeMode: (body && body.timeMode) || 'section_range',
      scheduleProfileId: (body && body.scheduleProfileId) || 'sys_uni_45min_v1',
      periods,
      constraints: (body && body.constraints) || { slotMinPeople: 1 },
      deadline: (body && body.deadline) || null,
      dateRangeStart: (body && body.dateRangeStart) || null,
      dateRangeEnd: (body && body.dateRangeEnd) || null,
      status: 'collecting',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.tasks[id] = task;
    save(db);
    return { ok: true, data: { task: clone(task) } };
  }
  if (m === 'GET' && createTask) {
    const gid = createTask[1];
    const list = Object.keys(db.tasks)
      .map((id) => db.tasks[id])
      .filter((t) => t.groupId === gid)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { ok: true, data: { list: list.map(clone), total: list.length, page: 1, pageSize: 50 } };
  }
  const taskOne = path.match(/^\/tasks\/([^/]+)$/);
  if (m === 'GET' && taskOne) {
    const t = db.tasks[taskOne[1]];
    if (!t) return { ok: false, code: 1301, message: '任务不存在' };
    const mem = db.members[t.groupId + ':' + db.currentUserId];
    const g = db.groups[t.groupId];
    let responseCount = 0;
    Object.keys(db.responses).forEach((k) => {
      if (db.responses[k].taskId === t.id && db.responses[k].isValid !== 0) responseCount++;
    });
    let memberCount = 0;
    Object.keys(db.members).forEach((k) => {
      if (db.members[k].groupId === t.groupId && db.members[k].status === 'active') memberCount++;
    });
    return {
      ok: true,
      data: {
        task: Object.assign(clone(t), {
          myRole: mem ? mem.roleInGroup : null,
          groupName: g ? g.name : '',
          responseCount,
          memberCount,
        }),
      },
    };
  }
  const schemeJob = path.match(/^\/tasks\/([^/]+)\/scheme-jobs$/);
  if (m === 'POST' && schemeJob) {
    const tid = schemeJob[1];
    const t = db.tasks[tid];
    if (!t) return { ok: false, code: 1301, message: '任务不存在' };
    const jobId = 'j_' + db.seq.job++;
    db.jobs[jobId] = {
      id: jobId,
      status: 'success',
      progress: 100,
      payload: { taskId: tid },
      result: { candidateSchedules: [{ schemeName: '本地方案A', assignments: [] }] },
    };
    t.candidateSchedules = [{ schemeName: '本地方案A', assignments: [] }];
    t.status = 'reviewing';
    save(db);
    return { ok: true, data: { jobId, status: 'success' } };
  }
  const jobGet = path.match(/^\/jobs\/([^/]+)$/);
  if (m === 'GET' && jobGet) {
    const job = db.jobs[jobGet[1]];
    if (!job) return { ok: false, code: 1901, message: '异步任务不存在' };
    return { ok: true, data: { job: clone(job) } };
  }
  const publish = path.match(/^\/tasks\/([^/]+)\/publish$/);
  if (m === 'POST' && publish) {
    const t = db.tasks[publish[1]];
    if (!t) return { ok: false, code: 1301, message: '任务不存在' };
    t.status = 'published';
    t.finalSchedule = (body && body.finalSchedule) ||
      (t.candidateSchedules && t.candidateSchedules[0]) || { schemeName: '默认', assignments: [] };
    t.shareToken = 'share_' + Date.now();
    t.publishedAt = new Date().toISOString();
    save(db);
    return { ok: true, data: { task: clone(t), shareToken: t.shareToken } };
  }
  const cancel = path.match(/^\/tasks\/([^/]+)\/cancel$/);
  if (m === 'POST' && cancel) {
    const t = db.tasks[cancel[1]];
    if (!t) return { ok: false, code: 1301, message: '任务不存在' };
    t.status = 'archived';
    save(db);
    return { ok: true, data: { task: clone(t) } };
  }
  const extend = path.match(/^\/tasks\/([^/]+)\/deadline\/extend$/);
  if (m === 'POST' && extend) {
    const t = db.tasks[extend[1]];
    if (!t) return { ok: false, code: 1301, message: '任务不存在' };
    t.deadline = (body && body.deadline) || t.deadline;
    if (t.status === 'reviewing') t.status = 'collecting';
    save(db);
    return { ok: true, data: { task: clone(t) } };
  }

  // —— responses ——
  const respMe = path.match(/^\/tasks\/([^/]+)\/responses\/me$/);
  if (m === 'PUT' && respMe) {
    const tid = respMe[1];
    const uid = db.currentUserId;
    const key = tid + ':' + uid;
    db.responses[key] = {
      taskId: tid,
      userId: uid,
      availableSlots: (body && body.availableSlots) || [],
      isValid: 1,
      updatedAt: new Date().toISOString(),
    };
    save(db);
    return { ok: true, data: { response: clone(db.responses[key]) } };
  }
  if (m === 'GET' && respMe) {
    const key = respMe[1] + ':' + db.currentUserId;
    const r = db.responses[key];
    if (!r) return { ok: false, code: 4040, message: '你尚未提交空闲时间' };
    return {
      ok: true,
      data: { response: Object.assign(clone(r), { availability: r.availableSlots }) },
    };
  }

  // —— inbox empty ——
  if (m === 'GET' && path === '/users/me/inbox') {
    return { ok: true, data: { list: [], total: 0, page: 1, pageSize: 20, unread: 0 } };
  }
  if (m === 'GET' && path === '/users/me/calendar') {
    return { ok: false, code: 1102, message: '个人日程表不存在' };
  }

  return { ok: false, code: 4040, message: '本地模式未实现: ' + m + ' ' + path };
}

module.exports = { handle, load, save };
