// pages/group/group.js — 分组详情；创建任务：timeMode + 基础模板（众数种子/API）
const groups = require('../../services/groups');
const tasks = require('../../services/tasks');
const profiles = require('../../services/profiles');
const { ensureLogin } = require('../../utils/auth');
const { fmtDate } = require('../../utils/format');
const {
  TIME_MODE_OPTIONS,
  DEFAULT_TASK_TIME_MODE,
  DEFAULT_PROFILE_ID,
  TIME_MODES,
  resolvePeriods,
  normalizePeriods,
} = require('../../utils/config');

Page({
  data: {
    groupId: '',
    group: null,
    members: [],
    taskList: [],
    loading: true,
    isPublisher: false,
    showCreate: false,
    taskForm: {
      title: '',
      description: '',
      deadline: '',
      dateRangeStart: '',
      dateRangeEnd: '',
      timeMode: DEFAULT_TASK_TIME_MODE,
      profileId: DEFAULT_PROFILE_ID,
    },
    modeOptions: TIME_MODE_OPTIONS,
    modeIndex: 0,
    profileOptions: [],
    profileIndex: 0,
    previewPeriods: [],
    submitting: false,
    showMembers: false,
  },

  onLoad(options) {
    this.groupId = options.groupId;
    const modeIndex = Math.max(
      0,
      TIME_MODE_OPTIONS.findIndex((m) => m.id === DEFAULT_TASK_TIME_MODE)
    );
    this.setData({
      groupId: options.groupId,
      modeOptions: TIME_MODE_OPTIONS,
      modeIndex,
    });
    this.bootstrapProfiles();
    this.loadAll();
  },

  onShow() {
    if (this.groupId) this.loadAll();
  },

  async bootstrapProfiles() {
    try {
      const { list, settings } = await profiles.listSystem();
      const defaultId = (settings && settings.defaultProfileId) || DEFAULT_PROFILE_ID;
      let idx = list.findIndex((p) => p.id === defaultId);
      if (idx < 0) idx = list.findIndex((p) => p.isDefault);
      if (idx < 0) idx = 0;
      const cur = list[idx] || null;
      this.setData({
        profileOptions: list,
        profileIndex: idx,
        previewPeriods: cur ? normalizePeriods(cur.slots) : [],
        'taskForm.profileId': cur ? cur.id : defaultId,
      });
    } catch (_) {
      this.setData({ profileOptions: [], previewPeriods: [] });
    }
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      await ensureLogin().catch(() => null);
      const [g, members, list] = await Promise.all([
        groups.getOne(this.groupId),
        groups.listMembers(this.groupId),
        tasks.listByGroup(this.groupId),
      ]);
      const role = (g && (g.myRole || g.roleInGroup)) || '';
      let publisherFlag = role === 'publisher' || role === 'owner';
      if (!publisherFlag) {
        const me = getApp().globalData.user || {};
        const mine = (members || []).find((m) => m.userId === me.id);
        publisherFlag = !!(mine && (mine.role === 'publisher' || mine.roleInGroup === 'publisher'));
      }
      const taskList = (list || []).map((t) =>
        Object.assign({}, t, { deadlineText: fmtDate(t.deadline) })
      );
      this.setData({
        group: g
          ? Object.assign({}, g, {
              myRole: publisherFlag ? 'publisher' : g.myRole || g.roleInGroup || 'member',
            })
          : null,
        members: members || [],
        taskList,
        isPublisher: !!publisherFlag,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  toggleMembers() {
    this.setData({ showMembers: !this.data.showMembers });
  },
  noop() {},

  _ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  openCreate() {
    if (!this.data.isPublisher) {
      return wx.showToast({ title: '仅发布者可新建任务', icon: 'none' });
    }
    const d = new Date(Date.now() + 3 * 86400000);
    const deadline = this._ymd(d);
    const start = this._ymd(new Date());
    const end = this._ymd(new Date(Date.now() + 6 * 86400000));
    const modeIndex = Math.max(
      0,
      this.data.modeOptions.findIndex((m) => m.id === DEFAULT_TASK_TIME_MODE)
    );
    const profilesList = this.data.profileOptions;
    const profileIndex = this.data.profileIndex || 0;
    const cur = profilesList[profileIndex];
    this.rebuildPreview(DEFAULT_TASK_TIME_MODE, cur);
    this.setData({
      showCreate: true,
      modeIndex,
      taskForm: {
        title: '',
        description: '',
        deadline,
        dateRangeStart: start,
        dateRangeEnd: end,
        timeMode: DEFAULT_TASK_TIME_MODE,
        profileId: cur ? cur.id : DEFAULT_PROFILE_ID,
      },
    });
  },
  closeCreate() {
    this.setData({ showCreate: false });
  },
  onTaskInput(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ ['taskForm.' + f]: e.detail.value });
  },
  onDeadlineChange(e) {
    this.setData({ 'taskForm.deadline': e.detail.value });
  },
  onRangeStartChange(e) {
    this.setData({ 'taskForm.dateRangeStart': e.detail.value });
  },
  onRangeEndChange(e) {
    this.setData({ 'taskForm.dateRangeEnd': e.detail.value });
  },
  onModeChange(e) {
    const idx = Number(e.detail.value) || 0;
    const mode = (this.data.modeOptions[idx] || {}).id || DEFAULT_TASK_TIME_MODE;
    const cur = this.data.profileOptions[this.data.profileIndex];
    this.setData({ modeIndex: idx, 'taskForm.timeMode': mode });
    this.rebuildPreview(mode, cur);
  },
  onProfileChange(e) {
    const idx = Number(e.detail.value) || 0;
    const cur = this.data.profileOptions[idx];
    this.setData({
      profileIndex: idx,
      'taskForm.profileId': cur ? cur.id : DEFAULT_PROFILE_ID,
    });
    this.rebuildPreview(this.data.taskForm.timeMode, cur);
  },

  rebuildPreview(timeMode, profile) {
    if (!profile || !profile.slots) {
      this.setData({ previewPeriods: [] });
      return;
    }
    try {
      // range 模板：直接用 slots；section*：全选 profile 预览
      const periods = resolvePeriods({
        mode: timeMode || DEFAULT_TASK_TIME_MODE,
        profileSlots: profile.slots,
        selectedIds: null,
        customRanges: timeMode === TIME_MODES.RANGE ? profile.slots : null,
      });
      this.setData({ previewPeriods: periods });
    } catch (_) {
      this.setData({ previewPeriods: normalizePeriods(profile.slots) });
    }
  },

  async submitTask() {
    const { taskForm, submitting, isPublisher, previewPeriods } = this.data;
    if (submitting) return;
    if (!isPublisher) return wx.showToast({ title: '仅发布者可创建', icon: 'none' });
    if (!taskForm.title.trim()) return wx.showToast({ title: '请输入任务标题', icon: 'none' });
    if (!taskForm.dateRangeStart || !taskForm.dateRangeEnd) {
      return wx.showToast({ title: '请选择排班日期范围', icon: 'none' });
    }
    if (taskForm.dateRangeStart > taskForm.dateRangeEnd) {
      return wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
    }
    const periods = normalizePeriods(previewPeriods);
    if (!periods.length) return wx.showToast({ title: '请选择基础作息模板', icon: 'none' });

    this.setData({ submitting: true });
    try {
      await ensureLogin();
      const t = await tasks.create(this.groupId, {
        title: taskForm.title.trim(),
        description: (taskForm.description || '').trim(),
        deadline: taskForm.deadline,
        dateRangeStart: taskForm.dateRangeStart,
        dateRangeEnd: taskForm.dateRangeEnd,
        timeMode: taskForm.timeMode || DEFAULT_TASK_TIME_MODE,
        scheduleProfileId: taskForm.profileId || DEFAULT_PROFILE_ID,
        // 最终 periods 快照（服务端也会 resolve；双写保证一致）
        periods: periods.map((p) => ({
          id: p.id,
          name: p.name,
          start: p.start,
          end: p.end,
          sectionIndex: p.sectionIndex,
          kind: p.kind,
        })),
        constraints: { slotMinPeople: 1 },
      });
      wx.showToast({ title: '已创建', icon: 'success' });
      this.closeCreate();
      this.loadAll();
      if (t && t.id) wx.navigateTo({ url: `/pages/task/task?taskId=${t.id}` });
    } catch (e) {
    } finally {
      this.setData({ submitting: false });
    }
  },

  onTaskTap(e) {
    const id = (e.detail && e.detail.id) || (e.currentTarget && e.currentTarget.dataset.id);
    if (!id) return;
    wx.navigateTo({ url: `/pages/task/task?taskId=${id}` });
  },

  async onKick(e) {
    if (!this.data.isPublisher) return;
    const userId = e.currentTarget.dataset.uid;
    const res = await wx.showModal({ title: '移出成员', content: '确定将该成员移出分组？' });
    if (!res.confirm) return;
    try {
      await ensureLogin();
      await groups.kick(this.groupId, userId);
      wx.showToast({ title: '已移出', icon: 'success' });
      this.loadAll();
    } catch (e) {}
  },

  async onLeave() {
    if (this.data.isPublisher) {
      return wx.showToast({ title: '发布者请先移交或解散分组', icon: 'none' });
    }
    const res = await wx.showModal({
      title: '退出分组',
      content: '退出后需重新加入',
      confirmColor: '#F53F3F',
    });
    if (!res.confirm) return;
    try {
      await ensureLogin();
      await groups.leave(this.groupId);
      wx.showToast({ title: '已退出', icon: 'success' });
      wx.navigateBack();
    } catch (e) {}
  },
});
