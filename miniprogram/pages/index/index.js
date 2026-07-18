// pages/index/index.js —— 产品级首页（接真实分组 API，失败保留空态）
const app = getApp();
const groupsApi = require('../../services/groups');
const { ensureLogin } = require('../../utils/auth');

Page({
  data: {
    statusBarHeight: 20,
    user: { nickname: '本地用户', initial: '本' },
    todayLabel: '',
    stat: { today: 0, pending: 0, week: 0 },
    hasPublisherRole: false,
    groups: [],
    loading: true,
  },

  onLoad() {
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 });
    } catch (e) {}
    this.setData({ todayLabel: this.formatToday() });

    if (app.onLoginReady) {
      app.onLoginReady((user) => {
        this.applyUser(user);
        this.loadGroups();
      });
    } else {
      this.applyUser(app.globalData && app.globalData.currentUser);
      this.loadGroups();
    }
  },

  onShow() {
    this.applyUser(app.globalData && app.globalData.currentUser);
    this.loadGroups();
  },

  onPullDownRefresh() {
    this.loadGroups().finally(() => wx.stopPullDownRefresh());
  },

  applyUser(user) {
    const u = user || { nickname: '本地用户', initial: '本' };
    const nickname = u.nickname || '本地用户';
    this.setData({
      user: {
        nickname,
        initial: u.initial || nickname.charAt(0) || '本',
      },
    });
  },

  formatToday() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
  },

  mapGroup(g) {
    const role = g.roleInGroup || g.myRole || g.role || 'member';
    const isPub = role === 'publisher' || role === 'owner';
    return {
      id: g.id,
      name: g.name || '未命名分组',
      role: isPub ? 'publisher' : 'member',
      roleLabel: isPub ? '发布者' : '成员',
      memberCount: g.memberCount != null ? g.memberCount : g.membersCount || 0,
      activeTaskCount: g.activeTaskCount != null ? g.activeTaskCount : g.activeTasks || 0,
      totalTasks: g.totalTasks != null ? g.totalTasks : 0,
      collectProgress: g.collectProgress != null ? g.collectProgress : 0,
      inviteCode: g.inviteCode || '',
    };
  },

  async loadGroups() {
    this.setData({ loading: true });
    try {
      await ensureLogin().catch(() => null);
      const list = await groupsApi.listMine();
      const groups = (list || []).map((g) => this.mapGroup(g));
      this.setData({ groups, loading: false });
      this.refreshPublisherFlag();
      this.computeStat();
    } catch (e) {
      // 无网/未登录：空列表，引导创建/加入
      this.setData({ groups: [], loading: false, hasPublisherRole: false });
      this.computeStat();
    }
  },

  computeStat() {
    const pending = this.data.groups.reduce(
      (sum, g) => sum + (g.activeTaskCount > 0 ? g.activeTaskCount : 0),
      0
    );
    this.setData({
      stat: {
        today: this.data.stat.today || 0,
        pending,
        week: this.data.stat.week || 0,
      },
    });
  },

  refreshPublisherFlag() {
    const hasPub = this.data.groups.some((g) => g.role === 'publisher');
    this.setData({ hasPublisherRole: hasPub });
  },

  onCreate() {
    const pubs = (this.data.groups || []).filter((g) => g.role === 'publisher');
    if (pubs.length === 1) {
      wx.navigateTo({
        url: '/pages/style-select/style-select?mode=create&groupId=' + pubs[0].id,
      });
      return;
    }
    if (pubs.length > 1) {
      wx.showActionSheet({
        itemList: pubs.map((g) => g.name),
        success: (res) => {
          const g = pubs[res.tapIndex];
          if (g) {
            wx.navigateTo({
              url: '/pages/style-select/style-select?mode=create&groupId=' + g.id,
            });
          }
        },
      });
      return;
    }
    // 无发布者身份：引导创建分组（join 页 create 模式或 style 无 group）
    wx.navigateTo({ url: '/pages/join/join?mode=create' });
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/join/join?mode=join' });
  },

  goCalendar() {
    wx.switchTab({ url: '/pages/schedule/schedule' });
  },

  goMyTask() {
    wx.switchTab({ url: '/pages/task/task' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  enterGroup(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/group-detail/group-detail?id=${id}` });
  },

  onGroupAction(e) {
    const id = e.currentTarget.dataset.id;
    const role = e.currentTarget.dataset.role;
    if (role === 'publisher') {
      wx.navigateTo({ url: `/pages/group-detail/group-detail?id=${id}` });
    } else {
      wx.navigateTo({ url: `/pages/joiner-fill/joiner-fill?groupId=${id}` });
    }
  },
});
