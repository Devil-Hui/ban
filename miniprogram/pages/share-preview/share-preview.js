// pages/share-preview/share-preview.js —— 分享预览（接 API 脱敏排班 / 兼容本地参数）
const tasksApi = require('../../services/tasks');

Page({
  data: {
    role: 'joiner',
    from: '',
    loading: true,
    error: '',
    taskId: '',
    token: '',
    names: [],
    groupInfo: {
      id: '',
      name: '排班任务',
      initial: '排',
      memberCount: 0,
      taskCount: 1,
      cycleLabel: '只读预览',
    },
    task: {
      id: '',
      title: '加载中…',
      dateRange: '—',
      periodCount: 0,
      publishedAt: '—',
      remark: '',
    },
    periods: [],
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    rows: [],
    assignments: [],
    confirmed: false,
    confirmedAt: '',
    expiresAt: '',
  },

  onLoad(options) {
    const role = options.role || (options.token ? 'joiner' : 'publisher');
    const from = options.from || '';
    const taskId = options.taskId || options.id || '';
    const token = options.token || options.shareToken || '';
    let names = [];
    if (options.names) {
      names = decodeURIComponent(options.names)
        .split(',')
        .filter(Boolean)
        .map((name, idx) => ({
          id: `n${idx + 1}`,
          name,
          initial: name.slice(-1),
        }));
    }
    this.setData({ role, from, taskId, token, names });

    const today = new Date();
    const dayOfWeek = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    this.setData({ calWeekStart: this.formatDate(monday) });

    if (taskId && token) {
      this.loadShared(taskId, token);
    } else if (taskId) {
      // 发布者从详情进入：尝试用已发布任务详情（需登录）拉真实数据
      this.loadAsPublisher(taskId);
    } else {
      this.setData({
        loading: false,
        error: '缺少任务或分享凭证',
      });
      this.buildWeekDays();
      this.buildRows();
    }
  },

  async loadShared(taskId, token) {
    this.setData({ loading: true, error: '' });
    try {
      const res = await tasksApi.getShared(taskId, token);
      this.applySharedPayload(res);
    } catch (e) {
      const msg =
        (e && e.message) ||
        (e && e.code === 1602 ? '预览链接已过期' : '预览链接无效');
      this.setData({ loading: false, error: msg, task: { title: '无法打开预览' } });
    }
  },

  async loadAsPublisher(taskId) {
    this.setData({ loading: true, error: '' });
    try {
      const t = await tasksApi.getOne(taskId);
      const shareToken = t.shareToken || '';
      if (shareToken) {
        await this.loadShared(taskId, shareToken);
        this.setData({ role: 'publisher', token: shareToken });
        return;
      }
      // 未发布：仅展示任务元信息
      const periods = (t.periods || []).map((p) => ({
        id: p.id,
        label: p.name || p.label || `${p.start || ''}-${p.end || ''}`,
        maxPeople: 1,
      }));
      this.setData({
        loading: false,
        task: {
          id: t.id,
          title: t.title || '排班任务',
          dateRange: this.shortRange(t.dateRangeStart, t.dateRangeEnd),
          periodCount: periods.length,
          publishedAt: t.publishedAt ? String(t.publishedAt).slice(0, 16) : '未发布',
          remark: t.description || '',
        },
        periods,
        assignments: [],
      });
      this.buildWeekDays();
      this.buildRows();
    } catch (_) {
      this.setData({ loading: false, error: '加载任务失败' });
    }
  },

  applySharedPayload(res) {
    const t = (res && res.task) || {};
    const schedule = t.schedule || {};
    const assignments = schedule.assignments || [];
    const periods = (t.periods || []).map((p) => ({
      id: p.id,
      label: p.name || `${p.start || ''}-${p.end || ''}` || p.id,
      maxPeople: 2,
    }));
    // 从 assignments 收集脱敏名单
    const nameSet = {};
    assignments.forEach((a) => {
      (a.userNames || []).forEach((n) => {
        if (n) nameSet[n] = true;
      });
    });
    const names = Object.keys(nameSet).map((name, idx) => ({
      id: `n${idx}`,
      name,
      initial: name.replace(/\*/g, '').slice(-1) || '成',
    }));

    this.setData({
      loading: false,
      error: '',
      names,
      assignments,
      periods,
      expiresAt: (res.meta && res.meta.expiresAt) || '',
      task: {
        id: t.id,
        title: t.title || '排班任务',
        dateRange: this.shortRange(t.dateRangeStart, t.dateRangeEnd),
        periodCount: periods.length,
        publishedAt: t.publishedAt ? String(t.publishedAt).slice(0, 16).replace('T', ' ') : '—',
        remark: '',
      },
      groupInfo: {
        id: '',
        name: schedule.schemeName || '排班方案',
        initial: '班',
        memberCount: names.length,
        taskCount: 1,
        cycleLabel: '只读',
      },
    });
    this.buildWeekDays();
    this.buildRowsFromAssignments();
  },

  shortRange(start, end) {
    if (!start && !end) return '—';
    const s = String(start || '').slice(5).replace('-', '.');
    const e = String(end || '').slice(5).replace('-', '.');
    if (s && e) return `${s} — ${e}`;
    return s || e || '—';
  },

  formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  buildWeekDays() {
    const { calWeekStart, weekLabels } = this.data;
    if (!calWeekStart) return;
    const [y, m, d] = calWeekStart.split('-').map(Number);
    const today = new Date();
    const todayStr = this.formatDate(today);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m - 1, d + i);
      const dateStr = this.formatDate(date);
      days.push({
        key: 'd' + i,
        weekday: weekLabels[i],
        dateShort: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(
          date.getDate()
        ).padStart(2, '0')}`,
        dateStr,
        day: date.getDate(),
        isToday: dateStr === todayStr,
      });
    }
    const weekEnd = new Date(y, m - 1, d + 6);
    this.setData({
      weekDays: days,
      calWeekLabel: `${calWeekStart} 至 ${this.formatDate(weekEnd)}`,
    });
  },

  prevWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 7);
    this.setData({ calWeekStart: this.formatDate(prev) }, () => {
      this.buildWeekDays();
      this.buildRowsFromAssignments();
    });
  },

  nextWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number);
    const next = new Date(y, m - 1, d + 7);
    this.setData({ calWeekStart: this.formatDate(next) }, () => {
      this.buildWeekDays();
      this.buildRowsFromAssignments();
    });
  },

  buildRowsFromAssignments() {
    const { periods, weekDays, assignments } = this.data;
    if (!periods.length) {
      this.buildRows();
      return;
    }
    const byKey = {};
    (assignments || []).forEach((a) => {
      const date = a.date ? String(a.date).slice(0, 10) : '';
      const pid = a.periodId || '';
      const key = date + '|' + pid;
      byKey[key] = (a.userNames || []).map((n) => ({
        maskedName: n,
        maskedPhone: '',
      }));
    });

    const rows = periods.map((p) => {
      const cells = (weekDays || []).map((day) => {
        const key = (day.dateStr || '') + '|' + p.id;
        return {
          dateStr: day.dateStr || '',
          periodId: p.id,
          assignees: byKey[key] || [],
        };
      });
      return { period: p, cells };
    });
    this.setData({ rows });
  },

  // 无 API 数据时的空表（兼容旧入口）
  buildRows() {
    const { periods, weekDays } = this.data;
    if (!periods.length) {
      this.setData({ rows: [] });
      return;
    }
    const rows = periods.map((p) => ({
      period: p,
      cells: (weekDays || []).map((day) => ({
        dateStr: day.dateStr || '',
        periodId: p.id,
        assignees: [],
      })),
    }));
    this.setData({ rows });
  },

  maskName(name) {
    const s = String(name || '');
    if (s.length <= 1) return s;
    if (s.length === 2) return s[0] + '*';
    return s[0] + '*' + s.slice(-1);
  },

  maskPhone() {
    return '';
  },

  onConfirm() {
    const now = new Date();
    this.setData({
      confirmed: true,
      confirmedAt: this.formatDate(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    });
    wx.showToast({ title: '已确认', icon: 'success' });
  },

  onShareAppMessage() {
    const { taskId, token, task } = this.data;
    const q = token
      ? `taskId=${taskId}&token=${token}`
      : `taskId=${taskId}`;
    return {
      title: (task && task.title) || '排班预览',
      path: `/pages/share-preview/share-preview?${q}`,
    };
  },
});
