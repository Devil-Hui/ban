// pages/task-create/task-create.js
// 逻辑链：选 mode → 选基础模板 → 配置日期/约束 → 提交 API 快照 periods
const groups = require('../../services/groups');
const tasks = require('../../services/tasks');
const profiles = require('../../services/profiles');
const { ensureLogin } = require('../../utils/auth');
const {
  TIME_MODES,
  TIME_MODE_META,
  TIME_MODE_OPTIONS,
  DEFAULT_TASK_TIME_MODE,
  DEFAULT_PROFILE_ID,
  resolvePeriods,
  normalizePeriods,
  displayLabel,
} = require('../../utils/config');

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plusDays(n) {
  return ymd(new Date(Date.now() + n * 86400000));
}

Page({
  data: {
    step: 4,
    steps: [
      { key: 'basic', label: '基础' },
      { key: 'date', label: '日期' },
      { key: 'period', label: '时段' },
      { key: 'constraint', label: '约束' },
    ],
    groupId: '',
    groupName: '请选择分组',
    title: '',
    description: '',
    dateStart: '',
    dateEnd: '',
    cycleRule: 'weekly',
    cycleRules: [
      { key: 'weekly', label: '每周循环' },
      { key: 'odd_weekly', label: '单周' },
      { key: 'even_weekly', label: '双周' },
      { key: 'custom', label: '自定义' },
    ],
    allWeeks: [
      { value: '1', label: '第1周' },
      { value: '2', label: '第2周' },
      { value: '3', label: '第3周' },
      { value: '4', label: '第4周' },
    ],
    customWeeks: { 1: true },
    customWeeksLabel: '第1周',

    // —— 三 mode + 基础模板（钟点来自种子，非页面硬编码）——
    timeMode: DEFAULT_TASK_TIME_MODE,
    timeModeLabel: TIME_MODE_META[DEFAULT_TASK_TIME_MODE].label,
    modeOptions: TIME_MODE_OPTIONS,
    modeIndex: 0,
    profileOptions: [],
    profileIndex: 0,
    profileId: DEFAULT_PROFILE_ID,
    periods: [],
    showSectionName: true,
    showTimeRange: true,
    allowEditRanges: false,

    minPeople: 1,
    maxPerWeek: null,
    deadlineType: 'tonight',
    deadlineDate: '',
    deadlineTime: '23:59',
    deadlineOptions: [
      { key: 'tonight', label: '今晚 23:59' },
      { key: '3days', label: '3 天后' },
      { key: '7days', label: '7 天后' },
      { key: 'unlimited', label: '不限时' },
      { key: 'custom', label: '自定义' },
    ],
    periodsSummary: '未配置',
    deadlineLabel: '今晚 23:59',
    submitting: false,
    publisherGroups: [],
  },

  async onLoad(opts) {
    const today = ymd(new Date());
    const weekLater = plusDays(6);
    let timeMode = opts.timeMode || DEFAULT_TASK_TIME_MODE;
    // 兼容 style=time|period|custom
    if (opts.style === 'time') timeMode = TIME_MODES.RANGE;
    if (opts.style === 'period') timeMode = TIME_MODES.SECTION;
    if (opts.style === 'custom') timeMode = TIME_MODES.SECTION_RANGE;

    const modeIndex = Math.max(
      0,
      TIME_MODE_OPTIONS.findIndex((m) => m.id === timeMode)
    );
    const meta = TIME_MODE_META[timeMode] || TIME_MODE_META[DEFAULT_TASK_TIME_MODE];

    this.setData({
      groupId: opts.groupId || '',
      dateStart: today,
      dateEnd: weekLater,
      timeMode,
      timeModeLabel: meta.label,
      modeIndex,
      showSectionName: !!meta.showSectionName,
      showTimeRange: !!meta.showTimeRange,
      allowEditRanges: timeMode === TIME_MODES.RANGE,
    });

    await this.bootstrap(opts.groupId, timeMode);
  },

  async bootstrap(groupId, timeMode) {
    try {
      await ensureLogin().catch(() => null);
      const [{ list }, mine] = await Promise.all([
        profiles.listSystem(),
        groups.listMine().catch(() => []),
      ]);
      const publisherGroups = (mine || []).filter(
        (g) => g.roleInGroup === 'publisher' || g.myRole === 'publisher' || g.role === 'publisher'
      );
      let gid = groupId || this.data.groupId;
      let gname = this.data.groupName;
      if (gid) {
        try {
          const g = await groups.getOne(gid);
          gname = (g && g.name) || gname;
        } catch (_) {
          const hit = publisherGroups.find((g) => g.id === gid);
          if (hit) gname = hit.name;
        }
      } else if (publisherGroups.length === 1) {
        gid = publisherGroups[0].id;
        gname = publisherGroups[0].name;
      }

      let profileIndex = list.findIndex((p) => p.isDefault);
      // range 模式优先值班 2h 模板
      if (timeMode === TIME_MODES.RANGE) {
        const duty = list.findIndex((p) => p.id === 'sys_duty_2h_v1');
        if (duty >= 0) profileIndex = duty;
      }
      if (profileIndex < 0) profileIndex = 0;
      const profile = list[profileIndex];

      this.setData({
        profileOptions: list,
        profileIndex,
        profileId: profile ? profile.id : DEFAULT_PROFILE_ID,
        groupId: gid || '',
        groupName: gname,
        publisherGroups,
      });
      this.applyProfile(profile, timeMode || this.data.timeMode);
    } catch (e) {
      console.warn('[task-create] bootstrap', e);
    }
  },

  applyProfile(profile, timeMode) {
    if (!profile) {
      this.setData({ periods: [], periodsSummary: '未配置' });
      return;
    }
    const mode = timeMode || this.data.timeMode;
    try {
      const periods = resolvePeriods({
        mode,
        profileSlots: profile.slots || [],
        customRanges: mode === TIME_MODES.RANGE ? profile.slots : null,
      }).map((p) =>
        Object.assign({}, p, {
          label: displayLabel(p, mode),
        })
      );
      this.setData({ periods }, this.updateSummary);
    } catch (_) {
      const periods = normalizePeriods(profile.slots).map((p) =>
        Object.assign({}, p, { label: displayLabel(p, mode) })
      );
      this.setData({ periods }, this.updateSummary);
    }
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value }, this.updateSummary);
  },
  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },
  onDateStart(e) {
    this.setData({ dateStart: e.detail.value }, this.updateSummary);
  },
  onDateEnd(e) {
    this.setData({ dateEnd: e.detail.value }, this.updateSummary);
  },
  pickCycle(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ cycleRule: key });
  },
  toggleCustomWeek(e) {
    const v = e.currentTarget.dataset.value;
    const map = Object.assign({}, this.data.customWeeks);
    if (map[v]) delete map[v];
    else map[v] = true;
    if (Object.keys(map).length === 0) {
      wx.showToast({ title: '至少选择 1 周', icon: 'none' });
      return;
    }
    const label = Object.keys(map)
      .sort((a, b) => +a - +b)
      .map((k) => {
        const w = this.data.allWeeks.find((x) => x.value === k);
        return w ? w.label : k;
      })
      .join('、');
    this.setData({ customWeeks: map, customWeeksLabel: label });
  },

  onModeChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = this.data.modeOptions[idx] || TIME_MODE_OPTIONS[0];
    const timeMode = opt.id;
    const meta = TIME_MODE_META[timeMode];
    let profileIndex = this.data.profileIndex;
    // 切换到 range 时若当前模板是课表型，自动切到 2h 值班模板
    if (timeMode === TIME_MODES.RANGE) {
      const duty = this.data.profileOptions.findIndex((p) => p.id === 'sys_duty_2h_v1');
      if (duty >= 0) profileIndex = duty;
    } else {
      const def = this.data.profileOptions.findIndex((p) => p.isDefault);
      if (def >= 0) profileIndex = def;
    }
    const profile = this.data.profileOptions[profileIndex];
    this.setData({
      modeIndex: idx,
      timeMode,
      timeModeLabel: meta.label,
      showSectionName: !!meta.showSectionName,
      showTimeRange: !!meta.showTimeRange,
      allowEditRanges: timeMode === TIME_MODES.RANGE,
      profileIndex,
      profileId: profile ? profile.id : this.data.profileId,
    });
    this.applyProfile(profile, timeMode);
  },

  onProfileChange(e) {
    const idx = Number(e.detail.value) || 0;
    const profile = this.data.profileOptions[idx];
    this.setData({
      profileIndex: idx,
      profileId: profile ? profile.id : DEFAULT_PROFILE_ID,
    });
    this.applyProfile(profile, this.data.timeMode);
  },

  onPeriodStart(e) {
    if (!this.data.allowEditRanges) return;
    const idx = e.currentTarget.dataset.index;
    const periods = this.data.periods.map((p, i) =>
      i === idx
        ? Object.assign({}, p, {
            start: e.detail.value,
            label: displayLabel(Object.assign({}, p, { start: e.detail.value }), this.data.timeMode),
          })
        : p
    );
    this.setData({ periods }, this.updateSummary);
  },
  onPeriodEnd(e) {
    if (!this.data.allowEditRanges) return;
    const idx = e.currentTarget.dataset.index;
    const periods = this.data.periods.map((p, i) =>
      i === idx
        ? Object.assign({}, p, {
            end: e.detail.value,
            label: displayLabel(Object.assign({}, p, { end: e.detail.value }), this.data.timeMode),
          })
        : p
    );
    this.setData({ periods }, this.updateSummary);
  },
  addPeriod() {
    if (!this.data.allowEditRanges) {
      return wx.showToast({ title: '节次模式请换「时间段」或改模板', icon: 'none' });
    }
    const periods = this.data.periods.slice();
    const last = periods[periods.length - 1];
    const start = last ? last.end : '08:00';
    const end = last ? this.plusHour(last.end, 2) : '10:00';
    const id = `t_${Date.now()}`;
    const p = { id, name: `${start}-${end}`, start, end, kind: 'range' };
    p.label = displayLabel(p, this.data.timeMode);
    periods.push(p);
    this.setData({ periods }, this.updateSummary);
  },
  delPeriod(e) {
    if (!this.data.allowEditRanges) return;
    const idx = e.currentTarget.dataset.index;
    if (this.data.periods.length <= 1) {
      return wx.showToast({ title: '至少保留 1 个时段', icon: 'none' });
    }
    const periods = this.data.periods.filter((_, i) => i !== idx);
    this.setData({ periods }, this.updateSummary);
  },

  plusHour(time, plus) {
    const parts = String(time || '08:00').split(':').map(Number);
    const nh = Math.min(23, (parts[0] || 0) + plus);
    return `${String(nh).padStart(2, '0')}:${String(parts[1] || 0).padStart(2, '0')}`;
  },

  incMinPeople() {
    this.setData({ minPeople: Math.min(20, this.data.minPeople + 1) }, this.updateSummary);
  },
  decMinPeople() {
    this.setData({ minPeople: Math.max(1, this.data.minPeople - 1) }, this.updateSummary);
  },
  incMaxWeek() {
    const cur = this.data.maxPerWeek === null ? 1 : this.data.maxPerWeek;
    this.setData({ maxPerWeek: Math.min(14, cur + 1) }, this.updateSummary);
  },
  decMaxWeek() {
    if (this.data.maxPerWeek === null) return;
    const cur = this.data.maxPerWeek - 1;
    this.setData({ maxPerWeek: cur <= 0 ? null : cur }, this.updateSummary);
  },
  clearMaxWeek() {
    this.setData({ maxPerWeek: this.data.maxPerWeek === null ? 1 : null }, this.updateSummary);
  },

  pickDeadline(e) {
    const key = e.currentTarget.dataset.key;
    const labels = {
      tonight: '今晚 23:59',
      '3days': '3 天后 23:59',
      '7days': '7 天后 23:59',
      unlimited: '不限时',
      custom: '自定义',
    };
    this.setData({ deadlineType: key, deadlineLabel: labels[key] }, this.updateSummary);
  },
  onDeadlineDate(e) {
    this.setData({ deadlineDate: e.detail.value }, this.updateSummary);
  },
  onDeadlineTime(e) {
    this.setData({ deadlineTime: e.detail.value }, this.updateSummary);
  },

  updateSummary() {
    const periods = this.data.periods || [];
    const mode = this.data.timeMode;
    let summary = '未配置';
    if (periods.length === 1) summary = displayLabel(periods[0], mode);
    else if (periods.length > 1) {
      summary = `${displayLabel(periods[0], mode)} 等 ${periods.length} 段`;
    }
    this.setData({ periodsSummary: summary });
  },

  resolveDeadline() {
    const { deadlineType, deadlineDate, deadlineTime } = this.data;
    if (deadlineType === 'unlimited') return null;
    if (deadlineType === 'custom') {
      if (!deadlineDate) return null;
      return `${deadlineDate} ${deadlineTime || '23:59'}`;
    }
    if (deadlineType === '3days') return `${plusDays(3)} 23:59`;
    if (deadlineType === '7days') return `${plusDays(7)} 23:59`;
    // tonight
    return `${ymd(new Date())} 23:59`;
  },

  async ensureGroupId() {
    if (this.data.groupId) return this.data.groupId;
    const pubs = this.data.publisherGroups || [];
    if (pubs.length === 1) {
      this.setData({ groupId: pubs[0].id, groupName: pubs[0].name });
      return pubs[0].id;
    }
    if (!pubs.length) {
      wx.showToast({ title: '请先创建分组（发布者）', icon: 'none' });
      return '';
    }
    // 多分组：跳回分组详情选择
    wx.showToast({ title: '请从分组进入创建', icon: 'none' });
    return '';
  },

  saveDraft() {
    wx.showToast({ title: '草稿将在后续版本支持', icon: 'none' });
  },

  async onPublish() {
    if (this.data.submitting) return;
    if (!this.data.title || !this.data.title.trim()) {
      return wx.showToast({ title: '请填写任务标题', icon: 'none' });
    }
    if (!this.data.dateStart || !this.data.dateEnd) {
      return wx.showToast({ title: '请选择日期范围', icon: 'none' });
    }
    if (this.data.dateStart > this.data.dateEnd) {
      return wx.showToast({ title: '开始日期不能晚于结束', icon: 'none' });
    }
    if (!this.data.periods.length) {
      return wx.showToast({ title: '请选择基础作息模板', icon: 'none' });
    }

    const groupId = await this.ensureGroupId();
    if (!groupId) return;

    const modal = await wx.showModal({
      title: '确认发布',
      content: `将「${this.data.title.trim()}」发布并开始收集空闲？\n模式：${this.data.timeModeLabel}\n时段：${this.data.periods.length} 个`,
    });
    if (!modal.confirm) return;

    this.setData({ submitting: true });
    try {
      await ensureLogin();
      const periods = normalizePeriods(this.data.periods);
      const task = await tasks.create(groupId, {
        title: this.data.title.trim(),
        description: (this.data.description || '').trim(),
        dateRangeStart: this.data.dateStart,
        dateRangeEnd: this.data.dateEnd,
        cycleRule: this.data.cycleRule,
        timeMode: this.data.timeMode,
        scheduleProfileId: this.data.profileId,
        periods: periods.map((p) => ({
          id: p.id,
          name: p.name,
          start: p.start,
          end: p.end,
          sectionIndex: p.sectionIndex,
          kind: p.kind,
        })),
        deadline: this.resolveDeadline(),
        constraints: {
          slotMinPeople: this.data.minPeople,
          maxShiftsPerWeek: this.data.maxPerWeek,
        },
      });
      wx.showToast({ title: '已创建', icon: 'success' });
      setTimeout(() => {
        if (task && task.id) {
          wx.redirectTo({ url: `/pages/task-detail/task-detail?id=${task.id}` });
        } else {
          wx.navigateBack();
        }
      }, 500);
    } catch (e) {
      // request 已 toast
    } finally {
      this.setData({ submitting: false });
    }
  },
});
