// pages/task-mark/task-mark.js —— 按时段快照 + 日期范围填报（接 API）
const tasksApi = require('../../services/tasks');
const responsesApi = require('../../services/responses');
const { ensureLogin } = require('../../utils/auth');
const {
  normalizePeriods,
  displayLabel,
  DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META,
} = require('../../utils/config');

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function eachDate(start, end) {
  const out = [];
  if (!start || !end) return out;
  const s = new Date(String(start).replace(/-/g, '/') + ' 00:00:00');
  const e = new Date(String(end).replace(/-/g, '/') + ' 00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return out;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(ymd(d));
  }
  return out;
}

function chunkWeeks(dates) {
  // 按自然周（周一开头）切块，返回 { start, dates[] }[]
  if (!dates.length) return [];
  const weeks = [];
  let cur = [];
  dates.forEach((ds) => {
    const d = new Date(ds.replace(/-/g, '/') + ' 00:00:00');
    const dow = d.getDay() || 7; // 1=Mon ... 7=Sun
    if (cur.length && dow === 1) {
      weeks.push(cur);
      cur = [];
    }
    cur.push(ds);
  });
  if (cur.length) weeks.push(cur);
  return weeks;
}

Page({
  data: {
    taskId: '',
    task: {
      title: '加载中…',
      groupName: '',
      deadline: '—',
      stateLabel: '收集中',
      progress: 0,
      submitted: 0,
      total: 0,
    },
    timeMode: DEFAULT_TASK_TIME_MODE,
    timeModeLabel: '',
    myStatus: '未提交',
    currentMode: 'available',
    weekOffset: 0,
    weekLabel: '本周',
    dateRangeLabel: '',
    dates: [],
    allDates: [],
    weeks: [],
    periods: [],
    grid: {},
    stats: { available: 0, busy: 0, total: 0 },
    submitting: false,
    loading: true,
    canSubmit: true,
  },

  onLoad(opts) {
    const id = opts.id || opts.taskId || '';
    this.setData({ taskId: id });
    this.loadTask();
  },

  async loadTask() {
    if (!this.data.taskId) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      await ensureLogin().catch(() => null);
      const t = await tasksApi.getOne(this.data.taskId);
      const timeMode = t.timeMode || DEFAULT_TASK_TIME_MODE;
      const meta = TIME_MODE_META[timeMode] || TIME_MODE_META[DEFAULT_TASK_TIME_MODE];
      const periods = normalizePeriods(t.periods || []).map((p) => ({
        id: p.id,
        label: meta.showSectionName ? p.name : displayLabel(p, timeMode),
        name: p.name,
        start: p.start || '',
        end: p.end || '',
      }));

      let dateList = eachDate(t.dateRangeStart, t.dateRangeEnd);
      if (!dateList.length) {
        // 无范围：默认未来 7 天
        const today = new Date();
        for (let i = 0; i < 7; i++) {
          dateList.push(ymd(new Date(today.getTime() + i * 86400000)));
        }
      }
      const weeks = chunkWeeks(dateList);
      const canSubmit = t.status === 'collecting';

      this.setData({
        loading: false,
        timeMode,
        timeModeLabel: meta.label,
        canSubmit,
        task: {
          title: t.title || '排班任务',
          groupName: t.groupName || '',
          deadline: t.deadline || '—',
          stateLabel: canSubmit ? '收集中' : t.status || '—',
          progress:
            t.memberCount > 0
              ? Math.round(((t.responseCount || 0) / t.memberCount) * 100)
              : 0,
          submitted: t.responseCount || 0,
          total: t.memberCount || 0,
        },
        periods,
        allDates: dateList,
        weeks,
        weekOffset: 0,
      });

      this.buildDates();
      await this.loadMine();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '任务加载失败', icon: 'none' });
    }
  },

  async loadMine() {
    try {
      const mine = await responsesApi.getMine(this.data.taskId);
      if (!mine || !mine.availability) return;
      const grid = JSON.parse(JSON.stringify(this.data.grid));
      const avail = mine.availability;
      if (Array.isArray(avail)) {
        avail.forEach((a) => {
          if (typeof a === 'string') {
            const [date, slot] = a.split('|');
            if (date && slot) {
              if (!grid[slot]) grid[slot] = {};
              grid[slot][date] = 'available';
            }
          } else if (a && a.date) {
            const slots = a.slots || a.periodIds || [];
            slots.forEach((slot) => {
              if (!grid[slot]) grid[slot] = {};
              grid[slot][a.date] = 'available';
            });
          }
        });
      }
      this.setData({ grid }, this.updateStats);
    } catch (_) {}
  },

  initGrid() {
    const grid = {};
    (this.data.periods || []).forEach((p) => {
      grid[p.id] = {};
      (this.data.dates || []).forEach((d) => {
        grid[p.id][d.dateStr] = 'none';
      });
    });
    // 保留其他周已有标记
    const old = this.data.grid || {};
    Object.keys(old).forEach((pid) => {
      if (!grid[pid]) grid[pid] = {};
      Object.keys(old[pid] || {}).forEach((ds) => {
        if (old[pid][ds] && old[pid][ds] !== 'none') grid[pid][ds] = old[pid][ds];
      });
    });
    this.setData({ grid }, this.updateStats);
  },

  buildDates() {
    const weeks = this.data.weeks || [];
    let offset = this.data.weekOffset || 0;
    if (offset < 0) offset = 0;
    if (weeks.length && offset >= weeks.length) offset = weeks.length - 1;
    const weekDates = weeks[offset] || this.data.allDates.slice(0, 7);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const todayStr = ymd(new Date());
    const dates = weekDates.map((ds) => {
      const d = new Date(ds.replace(/-/g, '/') + ' 00:00:00');
      return {
        dateStr: ds,
        day: d.getDate(),
        weekday: weekdays[d.getDay()],
        isToday: ds === todayStr,
      };
    });
    const weekLabel =
      weeks.length <= 1 ? '本段' : `第 ${offset + 1}/${weeks.length} 段`;
    const dateRangeLabel =
      dates.length > 0
        ? `${dates[0].dateStr.slice(5)} — ${dates[dates.length - 1].dateStr.slice(5)}`
        : '';
    this.setData({ dates, weekOffset: offset, weekLabel, dateRangeLabel }, () => {
      this.initGrid();
    });
  },

  setMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === 'available' || mode === 'busy') {
      this.setData({ currentMode: mode });
    }
  },

  toggleCell(e) {
    if (!this.data.canSubmit) {
      return wx.showToast({ title: '当前不在收集中', icon: 'none' });
    }
    const { period, date } = e.currentTarget.dataset;
    const grid = JSON.parse(JSON.stringify(this.data.grid));
    if (!grid[period]) grid[period] = {};
    const cur = grid[period][date] || 'none';
    const next = cur === this.data.currentMode ? 'none' : this.data.currentMode;
    grid[period][date] = next;
    this.setData({ grid }, this.updateStats);
  },

  clearAll() {
    wx.showModal({
      title: '清空所有标记',
      content: '将清除当前已加载日期的空闲/忙碌标记，是否继续？',
      success: (res) => {
        if (res.confirm) {
          const grid = {};
          (this.data.periods || []).forEach((p) => {
            grid[p.id] = {};
          });
          this.setData({ grid }, this.updateStats);
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      },
    });
  },

  importCalendar() {
    wx.showToast({ title: '日历导入后续版本支持', icon: 'none' });
  },

  prevWeek() {
    if (this.data.weekOffset <= 0) return;
    this.setData({ weekOffset: this.data.weekOffset - 1 }, this.buildDates);
  },
  nextWeek() {
    if (this.data.weekOffset >= (this.data.weeks || []).length - 1) return;
    this.setData({ weekOffset: this.data.weekOffset + 1 }, this.buildDates);
  },

  updateStats() {
    let available = 0;
    let busy = 0;
    const grid = this.data.grid || {};
    Object.keys(grid).forEach((p) => {
      Object.keys(grid[p] || {}).forEach((d) => {
        if (grid[p][d] === 'available') available++;
        else if (grid[p][d] === 'busy') busy++;
      });
    });
    const total = (this.data.periods.length || 0) * (this.data.allDates.length || 0);
    this.setData({
      stats: { available, busy, total },
      myStatus: available > 0 ? `已标记 ${available} 个空闲` : '未提交',
    });
  },

  saveDraft() {
    wx.showToast({ title: '请直接提交，服务端支持更新', icon: 'none' });
  },

  buildAvailability() {
    // grid: periodId -> dateStr -> available|busy|none
    // API: [{ date, slots: [periodId] }] 仅提交 available
    const byDate = {};
    const grid = this.data.grid || {};
    Object.keys(grid).forEach((pid) => {
      Object.keys(grid[pid] || {}).forEach((ds) => {
        if (grid[pid][ds] === 'available') {
          if (!byDate[ds]) byDate[ds] = [];
          byDate[ds].push(pid);
        }
      });
    });
    return Object.keys(byDate)
      .sort()
      .map((date) => ({ date, slots: byDate[date] }));
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.canSubmit) {
      return wx.showToast({ title: '当前不在收集中', icon: 'none' });
    }
    const availability = this.buildAvailability();
    if (!availability.length) {
      return wx.showToast({ title: '请至少标记一个空闲时段', icon: 'none' });
    }
    const conf = await wx.showModal({
      title: '确认提交',
      content: `共标记 ${this.data.stats.available} 个空闲格子。提交后截止前仍可修改。`,
    });
    if (!conf.confirm) return;

    this.setData({ submitting: true });
    try {
      await ensureLogin();
      // 用户点击提交：可请求截止提醒订阅（无真实模板 ID 时自动 inbox_only）
      try {
        const notifyApi = require('../../services/notify');
        await notifyApi.subscribe({ scene: 'deadline' });
      } catch (_) {}
      await responsesApi.submit(this.data.taskId, { availability });
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (_) {
    } finally {
      this.setData({ submitting: false });
    }
  },
});
