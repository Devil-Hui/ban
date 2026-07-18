// pages/group-detail/group-detail.js —— 接真实 group/tasks/members
const groupsApi = require('../../services/groups');
const tasksApi = require('../../services/tasks');
const { ensureLogin } = require('../../utils/auth');
const { TIME_MODE_META, DEFAULT_TASK_TIME_MODE, displayLabel } = require('../../utils/config');

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
    groupId: '',
    isPublisher: false,
    currentRole: 'member',
    currentTab: 'tasks',
    tabs: [
      { key: 'tasks', label: '任务', count: 0 },
      { key: 'members', label: '成员', count: 0 },
      { key: 'settings', label: '设置', count: 0 },
    ],
    group: {
      id: '',
      name: '加载中…',
      abbr: '组',
      role: 'member',
      inviteCode: '',
      memberCount: 0,
      activeTasks: 0,
      totalTasks: 0,
      templateName: '系统默认作息',
      cycleRuleLabel: '每周循环',
    },
    tasks: [],
    keyword: '',
    members: [],
    filteredMembers: [],
    loading: true,
  },

  onLoad(opts) {
    const id = opts.id || opts.groupId || '';
    this.setData({ groupId: id });
    this.loadAll();
  },

  onShow() {
    if (this.data.groupId) this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  mapTask(t) {
    const st = STATE_MAP[t.status] || STATE_MAP.collecting;
    const periods = t.periods || [];
    const mode = t.timeMode || DEFAULT_TASK_TIME_MODE;
    const modeLabel = (TIME_MODE_META[mode] && TIME_MODE_META[mode].label) || mode;
    const submitted = t.responseCount != null ? t.responseCount : 0;
    const total = t.memberCount != null ? t.memberCount : 0;
    const progress = total > 0 ? Math.min(100, Math.round((submitted / total) * 100)) : 0;
    return {
      id: t.id,
      title: t.title || '未命名任务',
      stateClass: st.stateClass,
      stateLabel: st.stateLabel,
      tagClass: st.tagClass,
      dateRange: shortRange(t.dateRangeStart, t.dateRangeEnd),
      periodsCount: periods.length,
      minPeople: (t.constraints && t.constraints.slotMinPeople) || 1,
      deadline: t.deadline || '—',
      progress,
      progressText:
        t.status === 'published'
          ? '已发布'
          : total
            ? `${submitted}/${total} 已提交`
            : `${periods.length} 个时段 · ${modeLabel}`,
      timeMode: mode,
      timeModeLabel: modeLabel,
      raw: t,
    };
  },

  mapMember(m) {
    const name = m.name || m.displayName || m.nickname || '成员';
    const role = m.role || m.roleInGroup || 'member';
    return {
      id: m.userId || m.id,
      userId: m.userId || m.id,
      initial: name.charAt(0),
      displayName: name,
      role,
      status: m.status || 'active',
      className: m.className || '',
      phoneMasked: m.phoneMasked || m.phone || '',
      submittedCount: m.submittedCount || 0,
    };
  },

  async loadAll() {
    const groupId = this.data.groupId;
    if (!groupId) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      await ensureLogin().catch(() => null);
      const [g, membersRaw, tasksRaw] = await Promise.all([
        groupsApi.getOne(groupId),
        groupsApi.listMembers(groupId).catch(() => []),
        tasksApi.listByGroup(groupId).catch(() => []),
      ]);
      const role = (g && (g.myRole || g.roleInGroup || g.role)) || 'member';
      const isPublisher = role === 'publisher' || role === 'owner';
      const members = (membersRaw || []).map((m) => this.mapMember(m));
      const tasks = (tasksRaw || []).map((t) => this.mapTask(t));
      const activeTasks = tasks.filter((t) =>
        ['collecting', 'reviewing', 'adjusting', 'published'].includes(
          (t.raw && t.raw.status) || t.stateClass
        )
      ).length;
      const name = (g && g.name) || '分组';
      this.setData({
        loading: false,
        isPublisher,
        currentRole: isPublisher ? 'publisher' : 'member',
        group: {
          id: groupId,
          name,
          abbr: name.charAt(0) || '组',
          role: isPublisher ? 'publisher' : 'member',
          inviteCode: (g && g.inviteCode) || '',
          memberCount: members.length,
          activeTasks,
          totalTasks: tasks.length,
          templateName: '基础作息（系统/分组）',
          cycleRuleLabel: (g && g.cycleRule) || 'weekly',
        },
        members,
        filteredMembers: members,
        tasks,
        tabs: [
          { key: 'tasks', label: '任务', count: tasks.length },
          { key: 'members', label: '成员', count: members.length },
          { key: 'settings', label: '设置', count: 0 },
        ],
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载分组失败', icon: 'none' });
    }
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.key });
  },

  switchRole(e) {
    const role = e.currentTarget.dataset.role;
    if (role === this.data.currentRole) return;
    // 真实权限：非发布者不能切到 publisher 操作
    if (role === 'publisher' && !this.data.isPublisher) {
      return wx.showToast({ title: '你不是该组发布者', icon: 'none' });
    }
    this.setData({ currentRole: role });
    wx.showToast({
      title: role === 'publisher' ? '已切换为发布者视图' : '已切换为成员视图',
      icon: 'none',
      duration: 800,
    });
  },

  switchToPublisher() {
    if (!this.data.isPublisher) {
      return wx.showToast({ title: '你不是该组发布者', icon: 'none' });
    }
    this.setData({ currentRole: 'publisher' });
  },

  goFillTime() {
    // 找第一个 collecting 任务进填报
    const collecting = (this.data.tasks || []).find(
      (t) => t.stateClass === 'collecting' || (t.raw && t.raw.status === 'collecting')
    );
    if (collecting) {
      wx.navigateTo({ url: `/pages/task-mark/task-mark?id=${collecting.id}` });
    } else {
      wx.showToast({ title: '暂无收集中的任务', icon: 'none' });
    }
  },

  goCreateTask() {
    const gid = this.data.groupId || (this.data.group && this.data.group.id) || '';
    wx.navigateTo({
      url: '/pages/style-select/style-select?mode=create&groupId=' + gid,
    });
  },

  goTaskDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${id}` });
  },

  onSearch(e) {
    const keyword = e.detail.value || '';
    const filtered = this.data.members.filter((m) => m.displayName.includes(keyword));
    this.setData({ keyword, filteredMembers: filtered });
  },

  onMemberTap(e) {
    if (this.data.currentRole !== 'publisher' || !this.data.isPublisher) return;
    const id = e.currentTarget.dataset.id;
    const member = this.data.members.find((m) => m.id === id);
    if (!member || member.role === 'publisher') return;
    if (member.status !== 'active') {
      wx.showToast({ title: '该成员已不在分组', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['踢出分组'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          const conf = await wx.showModal({
            title: '移出成员',
            content: `确定移出 ${member.displayName}？`,
            confirmColor: '#E88B8B',
          });
          if (!conf.confirm) return;
          try {
            await ensureLogin();
            await groupsApi.kick(this.data.groupId, member.userId || member.id);
            wx.showToast({ title: '已移出', icon: 'success' });
            this.loadAll();
          } catch (_) {}
        }
      },
    });
  },

  copyCode(e) {
    const code = e.currentTarget.dataset.code || this.data.group.inviteCode;
    if (!code) return wx.showToast({ title: '暂无邀请码', icon: 'none' });
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
    });
  },

  editTemplate() {
    wx.showToast({ title: '分组作息导入：后续在设置中配置', icon: 'none' });
  },
  editCycle() {
    wx.showToast({ title: '循环规则随任务配置', icon: 'none' });
  },
  regenCode() {
    wx.showToast({ title: '重置邀请码开发中', icon: 'none' });
  },
  archiveGroup() {
    wx.showToast({ title: '归档分组开发中', icon: 'none' });
  },
  async confirmLeave() {
    if (this.data.isPublisher) {
      return wx.showToast({ title: '发布者请先移交分组', icon: 'none' });
    }
    const conf = await wx.showModal({
      title: '退出分组',
      content: '退出后将无法接收该分组的新任务，历史数据保留。',
      confirmText: '确认退出',
      confirmColor: '#E88B8B',
    });
    if (!conf.confirm) return;
    try {
      await ensureLogin();
      await groupsApi.leave(this.data.groupId);
      wx.showToast({ title: '已退出分组', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (_) {}
  },
});
