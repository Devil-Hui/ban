// pages/task-detail/task-detail.js —— 任务详情（接 API + periods/timeMode 快照）
const tasksApi = require('../../services/tasks');
const { ensureLogin } = require('../../utils/auth');
const {
  normalizePeriods,
  displayLabel,
  DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META,
} = require('../../utils/config');

const STATE_MAP = {
  collecting: { stateClass: 'collecting', stateLabel: '收集中', tagClass: 'brand' },
  reviewing: { stateClass: 'reviewing', stateLabel: '待生成', tagClass: 'brand' },
  published: { stateClass: 'published', stateLabel: '已发布', tagClass: 'success' },
  adjusting: { stateClass: 'adjusting', stateLabel: '调整中', tagClass: 'brand' },
  archived: { stateClass: 'archived', stateLabel: '已归档', tagClass: 'neutral' },
  cancelled: { stateClass: 'archived', stateLabel: '已取消', tagClass: 'neutral' },
};

function shortRange(start, end) {
  if (!start && !end) return '—';
  const s = String(start || '').slice(5).replace('-', '.');
  const e = String(end || '').slice(5).replace('-', '.');
  if (s && e) return `${s}—${e}`;
  return s || e || '—';
}

Page({
  data: {
    taskId: '',
    loading: true,
    task: {
      title: '加载中…',
      groupName: '',
      dateRange: '—',
      stateClass: 'collecting',
      stateLabel: '—',
      tagClass: 'brand',
      role: 'member',
      roleLabel: '成员',
      periodsCount: 0,
      minPeople: 1,
      maxPerWeek: null,
      deadline: '—',
      deadlineUrgent: false,
      progress: 0,
      total: 0,
      submitted: 0,
      timeModeLabel: '',
    },
    timeline: [],
    periods: [],
    submittedCount: 0,
    submitStatus: [],
    objections: [],
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    calWeekLabel: '',
    calendarCells: [],
    selectedDate: null,
    calWeekStart: '',
    heatData: {},
    slotMinPeople: 1,
    canGenerate: false,
    canMark: false,
    canCancel: false,
  },

  onLoad(opts) {
    const id = opts.id || opts.taskId || '';
    this.setData({ taskId: id });
    const today = new Date();
    const dayOfWeek = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    this.setData({
      calWeekStart: this.formatDate(monday.getFullYear(), monday.getMonth(), monday.getDate()),
    });
    this.loadTask();
  },

  onShow() {
    if (this.data.taskId) this.loadTask();
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
      const st = STATE_MAP[t.status] || STATE_MAP.collecting;
      const role = t.myRole || t.roleInGroup || 'member';
      const isPublisher = role === 'publisher' || role === 'owner';
      const timeMode = t.timeMode || DEFAULT_TASK_TIME_MODE;
      const meta = TIME_MODE_META[timeMode] || TIME_MODE_META[DEFAULT_TASK_TIME_MODE];
      const periodsRaw = normalizePeriods(t.periods || []);
      const minPeople = (t.constraints && t.constraints.slotMinPeople) || 1;
      const periods = periodsRaw.map((p, index) => ({
        id: p.id,
        start: p.start || '',
        end: p.end || '',
        name: p.name,
        label: displayLabel(p, timeMode),
        minPeople,
        assignedCount: 0,
        shortCount: 0,
        urgent: false,
        assignedMembers: [],
        index,
      }));

      const submitted = t.responseCount || 0;
      const total = t.memberCount || 0;
      const progress = total > 0 ? Math.min(100, Math.round((submitted / total) * 100)) : 0;

      const timeline = [
        {
          key: 'create',
          label: '任务已创建',
          time: t.createdAt ? String(t.createdAt).slice(0, 16).replace('T', ' ') : '',
          done: true,
          current: false,
        },
        {
          key: 'collect',
          label: '收集空闲时间',
          time: total ? `${submitted}/${total} 已提交` : '进行中',
          done: t.status !== 'collecting',
          current: t.status === 'collecting',
        },
        {
          key: 'generate',
          label: '生成排班方案',
          time: t.candidateSchedules && t.candidateSchedules.length ? '已有候选' : '待进行',
          done: !!(t.candidateSchedules && t.candidateSchedules.length) || t.status === 'published',
          current: t.status === 'reviewing',
        },
        {
          key: 'publish',
          label: '发布排班结果',
          time: t.status === 'published' ? '已发布' : '待进行',
          done: t.status === 'published',
          current: false,
        },
      ];

      this.setData({
        loading: false,
        task: {
          title: t.title || '排班任务',
          groupName: t.groupName || '',
          dateRange: shortRange(t.dateRangeStart, t.dateRangeEnd),
          stateClass: st.stateClass,
          stateLabel: st.stateLabel,
          tagClass: st.tagClass,
          role: isPublisher ? 'publisher' : 'member',
          roleLabel: isPublisher ? '发布者' : '成员',
          periodsCount: periods.length,
          minPeople,
          maxPerWeek: (t.constraints && t.constraints.maxShiftsPerWeek) || null,
          deadline: t.deadline || '—',
          deadlineUrgent: false,
          progress,
          total,
          submitted,
          timeModeLabel: meta.label,
          status: t.status,
        },
        periods,
        timeline,
        submittedCount: submitted,
        slotMinPeople: minPeople,
        canGenerate: isPublisher && (t.status === 'collecting' || t.status === 'reviewing'),
        // 发布者本人也是成员，收集期应可填报空闲（勿用 !isPublisher 锁死）
        canMark: t.status === 'collecting',
        canCancel: isPublisher && t.status === 'collecting',
        // 热力：用任务 periods 做轻量展示，无 mock 随机人
        heatData: this.buildHeatFromPeriods(t, periods),
      });
      this.buildWeekCalendar();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载任务失败', icon: 'none' });
    }
  },

  buildHeatFromPeriods(t, periods) {
    // 简化：在日期范围内每天挂全部 periods，submitters 空（真热力需聚合接口）
    const data = {};
    if (!t.dateRangeStart || !t.dateRangeEnd) return data;
    const s = new Date(String(t.dateRangeStart).replace(/-/g, '/') + ' 00:00:00');
    const e = new Date(String(t.dateRangeEnd).replace(/-/g, '/') + ' 00:00:00');
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const ds = this.formatDate(d.getFullYear(), d.getMonth(), d.getDate());
      data[ds] = periods.map((p) => ({
        pid: p.id,
        start: p.start,
        end: p.end,
        name: p.name,
        submitters: [],
      }));
    }
    return data;
  },

  buildWeekCalendar() {
    const { calWeekStart, heatData, slotMinPeople, weekLabels } = this.data;
    if (!calWeekStart) return;
    const [y, m, d] = calWeekStart.split('-').map(Number);
    const cells = [];
    const today = new Date();
    const todayStr = this.formatDate(today.getFullYear(), today.getMonth(), today.getDate());

    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m - 1, d + i);
      const dateStr = this.formatDate(date.getFullYear(), date.getMonth(), date.getDate());
      const dayData = heatData[dateStr] || [];
      const submitCount = dayData.filter((s) => s.submitters && s.submitters.length).length;
      let heatLevel = 0;
      if (dayData.length) heatLevel = 1;
      cells.push({
        key: dateStr,
        date: dateStr,
        day: date.getDate(),
        monthDay: `${date.getMonth() + 1}/${date.getDate()}`,
        weekday: weekLabels[i],
        isToday: dateStr === todayStr,
        submitCount,
        heatLevel,
        dayData,
      });
    }
    const weekEnd = new Date(y, m - 1, d + 6);
    this.setData({
      calWeekLabel: `${calWeekStart} 至 ${this.formatDate(
        weekEnd.getFullYear(),
        weekEnd.getMonth(),
        weekEnd.getDate()
      )}`,
      calendarCells: cells,
    });
  },

  formatDate(y, m, d) {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  },

  prevWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 7);
    this.setData(
      { calWeekStart: this.formatDate(prev.getFullYear(), prev.getMonth(), prev.getDate()) },
      () => this.buildWeekCalendar()
    );
  },

  nextWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number);
    const next = new Date(y, m - 1, d + 7);
    this.setData(
      { calWeekStart: this.formatDate(next.getFullYear(), next.getMonth(), next.getDate()) },
      () => this.buildWeekCalendar()
    );
  },

  onCellTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    const dayData = this.data.heatData[date] || [];
    if (!dayData.length) {
      wx.showToast({ title: '该日期不在任务范围内', icon: 'none' });
      return;
    }
    const lines = dayData
      .map((s) => `${s.name || s.pid} ${s.start || ''}-${s.end || ''}`)
      .slice(0, 6)
      .join('\n');
    wx.showModal({
      title: date,
      content: lines || '无时段',
      showCancel: false,
    });
  },

  goMark() {
    wx.navigateTo({ url: `/pages/task-mark/task-mark?id=${this.data.taskId}` });
  },

  goGenerate() {
    return this.generateScheme();
  },

  async generateScheme() {
    if (!this.data.canGenerate) return;
    if (this._generating) return;
    this._generating = true;
    try {
      await ensureLogin();
      wx.showLoading({ title: '提交生成…' });
      const gen = await tasksApi.generate(this.data.taskId);
      wx.hideLoading();
      const jobId = gen.jobId || (gen.job && gen.job.id);
      if (jobId) {
        wx.showToast({ title: '已开始生成', icon: 'success' });
        let i = 0;
        while (i++ < 25) {
          const job = await tasksApi.getJob(jobId);
          const st = job.status === 'success' ? 'succeeded' : job.status;
          if (st === 'succeeded') {
            wx.showToast({ title: '方案已生成', icon: 'success' });
            // 统一入口：进入方案预览页做对比/发布（避免三处各自 mock 发布）
            setTimeout(() => {
              wx.navigateTo({
                url:
                  '/pages/scheme-preview/scheme-preview?taskId=' +
                  encodeURIComponent(this.data.taskId) +
                  '&mode=generate',
              });
            }, 400);
            return;
          }
          if (st === 'failed') {
            wx.showToast({ title: '生成失败', icon: 'none' });
            return;
          }
          await new Promise((r) => setTimeout(r, 800));
        }
        wx.showToast({ title: '生成超时，请重试', icon: 'none' });
      } else {
        // 同步完成无 jobId：仍进预览
        wx.navigateTo({
          url:
            '/pages/scheme-preview/scheme-preview?taskId=' +
            encodeURIComponent(this.data.taskId) +
            '&mode=generate',
        });
      }
      this.loadTask();
    } catch (_) {
      wx.hideLoading();
    } finally {
      this._generating = false;
    }
  },

  async publishScheme() {
    try {
      await ensureLogin();
      // 发布前请求订阅：有微信模板 ID 则弹窗，否则记站内偏好
      try {
        const notifyApi = require('../../services/notify');
        await notifyApi.subscribe({ scene: 'publish' });
      } catch (_) {}
      const pub = await tasksApi.publish(this.data.taskId, {});
      wx.showToast({ title: '已发布', icon: 'success' });
      this.loadTask();
      // 有 shareToken 时提供分享预览入口
      if (pub && pub.shareToken) {
        setTimeout(() => {
          wx.showModal({
            title: '发布成功',
            content: '是否打开分享预览页？',
            confirmText: '去分享',
            success: (r) => {
              if (r.confirm) {
                wx.navigateTo({
                  url: `/pages/share-preview/share-preview?taskId=${this.data.taskId}&token=${pub.shareToken}&role=publisher`,
                });
              }
            },
          });
        }, 400);
      }
    } catch (_) {}
  },

  async extendDeadline() {
    const conf = await wx.showModal({
      title: '延长截止',
      content: '将截止时间延长 2 天，并保持收集状态。',
    });
    if (!conf.confirm) return;
    try {
      await ensureLogin();
      const d = new Date(Date.now() + 2 * 86400000);
      const deadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 23:59`;
      await tasksApi.extendDeadline(this.data.taskId, { deadline });
      wx.showToast({ title: '已延长', icon: 'success' });
      this.loadTask();
    } catch (_) {}
  },

  goAdjust() {
    wx.showToast({ title: '调整页开发中，可先重新生成', icon: 'none' });
  },

  goReceipt() {
    wx.navigateTo({ url: `/pages/schedule-receipt/schedule-receipt?taskId=${this.data.taskId}` });
  },

  async cancelTask() {
    const conf = await wx.showModal({
      title: '取消任务',
      content: '取消后任务将归档。',
      confirmText: '确认取消',
      confirmColor: '#E88B8B',
    });
    if (!conf.confirm) return;
    try {
      await ensureLogin();
      await tasksApi.cancel(this.data.taskId);
      wx.showToast({ title: '任务已取消', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (_) {}
  },

  reopenCollect() {
    this.extendDeadline();
  },
  archiveTask() {
    this.cancelTask();
  },
  shareTask() {
    wx.navigateTo({ url: `/pages/share-preview/share-preview?taskId=${this.data.taskId}` });
  },
  rollbackScheme() {
    wx.showToast({ title: '回滚开发中', icon: 'none' });
  },
  reopenSubmit() {
    wx.showToast({ title: '重开提交开发中', icon: 'none' });
  },
  goObjection() {
    wx.navigateTo({ url: `/pages/objection/objection?taskId=${this.data.taskId}` });
  },
  closeDetail() {
    this.setData({ selectedDate: null });
  },
});
