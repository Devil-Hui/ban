// pages/task/task.js —— 任务 Tab：聚合我所有分组下的任务（真 API）
const groupsApi = require('../../services/groups');
const tasksApi = require('../../services/tasks');
const { ensureLogin } = require('../../utils/auth');
const { TIME_MODE_META, DEFAULT_TASK_TIME_MODE } = require('../../utils/config');

const STATE_MAP = {
  collecting: { stateClass: 'collecting', stateLabel: '收集中', tagClass: 'brand', filter: 'collecting' },
  reviewing: { stateClass: 'reviewing', stateLabel: '待生成', tagClass: 'warning', filter: 'reviewing' },
  published: { stateClass: 'published', stateLabel: '已发布', tagClass: 'success', filter: 'published' },
  adjusting: { stateClass: 'adjusting', stateLabel: '调整中', tagClass: 'danger', filter: 'adjusting' },
  archived: { stateClass: 'archived', stateLabel: '已归档', tagClass: 'neutral', filter: 'archived' },
  cancelled: { stateClass: 'archived', stateLabel: '已取消', tagClass: 'neutral', filter: 'archived' },
};

function shortRange(start, end) {
  if (!start && !end) return '—';
  const s = String(start || '').slice(5).replace('-', '.');
  const e = String(end || '').slice(5).replace('-', '.');
  if (s && e) return `${s}—${e}`;
  return s || e || '—';
}

function deadlineText(dl) {
  if (!dl) return '—';
  const s = String(dl);
  if (s.length >= 16) return s.slice(5, 16).replace('T', ' ');
  return s.slice(0, 16);
}

Page({
  data: {
    statusBarHeight: 20,
    currentTab: 'all',
    currentFilter: 'all',
    sortLabel: '截止时间',
    sortKey: 'deadline',
    tabs: [
      { key: 'all', label: '全部', count: 0 },
      { key: 'publisher', label: '我发布的', count: 0 },
      { key: 'member', label: '我参与的', count: 0 },
    ],
    filters: [
      { key: 'all', label: '全部状态' },
      { key: 'collecting', label: '收集中' },
      { key: 'reviewing', label: '待生成' },
      { key: 'published', label: '已发布' },
      { key: 'adjusting', label: '调整中' },
      { key: 'archived', label: '已归档' },
    ],
    tasks: [],
    filteredTasks: [],
    currentTabLabel: '全部',
    emptyHint: '创建分组并发布任务后，会出现在这里',
    loading: true,
  },

  onLoad() {
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 });
    } catch (e) {}
  },

  onShow() {
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  mapTask(t, group) {
    const roleInGroup = group.roleInGroup || group.myRole || group.role || 'member';
    const isPub =
      roleInGroup === 'publisher' ||
      roleInGroup === 'owner' ||
      t.publisherId === (getApp().globalData.user || {}).id;
    const role = isPub ? 'publisher' : 'member';
    const st = STATE_MAP[t.status] || STATE_MAP.collecting;
    const periods = t.periods || [];
    const mode = t.timeMode || DEFAULT_TASK_TIME_MODE;
    const modeLabel = (TIME_MODE_META[mode] && TIME_MODE_META[mode].label) || '';
    const submitted = t.responseCount != null ? t.responseCount : null;
    const total = t.memberCount != null ? t.memberCount : null;
    let progress = null;
    let progressText = '';
    if (t.status === 'published') {
      progress = 100;
      progressText = '已发布';
    } else if (total != null && submitted != null && total > 0) {
      progress = Math.min(100, Math.round((submitted / total) * 100));
      progressText = `${submitted}/${total} 已提交`;
    } else if (periods.length) {
      progressText = `${periods.length} 时段 · ${modeLabel}`;
    }

    const actions = [];
    if (role === 'publisher') {
      if (t.status === 'collecting' || t.status === 'reviewing') {
        actions.push({ key: 'preview', label: '查看进度', type: 'ghost' });
        actions.push({ key: 'generate', label: '生成方案', type: 'primary' });
      } else if (t.status === 'published') {
        actions.push({ key: 'preview', label: '查看详情', type: 'primary' });
      } else {
        actions.push({ key: 'history', label: '查看', type: 'outline' });
      }
    } else {
      if (t.status === 'collecting') {
        actions.push({ key: 'mark', label: '去填写空闲', type: 'primary' });
      } else if (t.status === 'published') {
        actions.push({ key: 'receipt', label: '查看并查收', type: 'primary' });
      } else {
        actions.push({ key: 'wait', label: '查看详情', type: 'outline' });
      }
    }

    return {
      id: t.id,
      title: t.title || '未命名任务',
      groupId: group.id,
      groupName: group.name || '分组',
      role,
      roleLabel: role === 'publisher' ? '发布者' : '成员',
      stateClass: st.stateClass,
      stateLabel: st.stateLabel,
      tagClass: st.tagClass,
      dateRange: shortRange(t.dateRangeStart, t.dateRangeEnd),
      periodsCount: periods.length,
      progress,
      progressText,
      deadline: deadlineText(t.deadline),
      deadlineRaw: t.deadline || '',
      createdAt: t.createdAt || '',
      tab: role,
      filter: st.filter,
      timeMode: mode,
      timeModeLabel: modeLabel,
      actions,
    };
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      await ensureLogin().catch(() => null);
      const groupList = await groupsApi.listMine();
      const groups = groupList || [];
      const chunks = await Promise.all(
        groups.map(async (g) => {
          try {
            const list = await tasksApi.listByGroup(g.id);
            return (list || []).map((t) => this.mapTask(t, g));
          } catch (_) {
            return [];
          }
        })
      );
      const tasks = [].concat.apply([], chunks);
      this.setData({ tasks, loading: false });
      this.applyFilter();
    } catch (e) {
      this.setData({ tasks: [], loading: false });
      this.applyFilter();
    }
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ currentTab: key }, this.applyFilter);
  },

  switchFilter(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ currentFilter: key }, this.applyFilter);
  },

  toggleSort() {
    const nextKey = this.data.sortKey === 'deadline' ? 'createdAt' : 'deadline';
    const nextLabel = nextKey === 'deadline' ? '截止时间' : '创建时间';
    this.setData({ sortKey: nextKey, sortLabel: nextLabel }, this.applyFilter);
  },

  applyFilter() {
    const { currentTab, currentFilter, tasks, tabs, filters, sortKey } = this.data;
    let filtered = tasks.slice();
    if (currentTab !== 'all') {
      filtered = filtered.filter((t) => t.role === currentTab);
    }
    if (currentFilter !== 'all') {
      filtered = filtered.filter((t) => t.filter === currentFilter);
    }
    filtered.sort((a, b) => {
      const av = a[sortKey] || '';
      const bv = b[sortKey] || '';
      if (av === bv) return 0;
      // 无截止的沉底
      if (!av) return 1;
      if (!bv) return -1;
      return av < bv ? -1 : 1;
    });

    const pubCount = tasks.filter((t) => t.role === 'publisher').length;
    const memCount = tasks.filter((t) => t.role === 'member').length;
    const nextTabs = [
      { key: 'all', label: '全部', count: tasks.length },
      { key: 'publisher', label: '我发布的', count: pubCount },
      { key: 'member', label: '我参与的', count: memCount },
    ];

    const tabInfo = nextTabs.find((t) => t.key === currentTab) || nextTabs[0];
    const filterInfo = filters.find((f) => f.key === currentFilter);
    this.setData({
      tabs: nextTabs,
      filteredTasks: filtered,
      currentTabLabel:
        (tabInfo ? tabInfo.label : '') +
        (filterInfo && filterInfo.key !== 'all' ? `·${filterInfo.label}` : ''),
      emptyHint:
        tasks.length === 0
          ? '还没有任务：去首页创建分组并发布排班'
          : '尝试切换上方筛选条件',
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${id}` });
  },

  onAction(e) {
    const { action, taskId } = e.currentTarget.dataset;
    const routes = {
      preview: `/pages/task-detail/task-detail?id=${taskId}`,
      generate: `/pages/task-detail/task-detail?id=${taskId}`,
      receipt: `/pages/schedule-receipt/schedule-receipt?taskId=${taskId}`,
      mark: `/pages/task-mark/task-mark?id=${taskId}`,
      wait: `/pages/task-detail/task-detail?id=${taskId}`,
      history: `/pages/task-detail/task-detail?id=${taskId}`,
    };
    wx.navigateTo({ url: routes[action] || `/pages/task-detail/task-detail?id=${taskId}` });
  },
});
