// pages/profile/profile.js —— 我的：用户/分组 + 消息中心 + 订阅开关
const app = getApp();
const groupsApi = require('../../services/groups');
const notifyApi = require('../../services/notify');
const { ensureLogin } = require('../../utils/auth');

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    user: {
      nickname: '未登录',
      initial: '我',
      groupsCount: 0,
      tasksCount: 0,
    },
    stats: {
      publishCount: 0,
      participateCount: 0,
      hoursTotal: 0,
    },
    groups: [],
    inbox: [],
    inboxUnread: 0,
    notifyMode: 'inbox_only',
    notifyModeLabel: '站内消息',
    toolsMenu: [
      { key: 'inbox', title: '消息中心', desc: '发布与截止提醒', icon: '✉', iconClass: 'notify', badge: 0 },
      { key: 'calendar', title: '我的日历', desc: '查看排班日程', icon: '▦', iconClass: 'calendar' },
      { key: 'notify', title: '开启提醒', desc: '订阅发布/截止通知', icon: '∘', iconClass: 'notify' },
      { key: 'share', title: '分享与邀请', desc: '邀请码、分享链接管理', icon: '⇪', iconClass: 'share' },
    ],
    settingsMenu: [
      { key: 'notify-task', title: '截止提醒', desc: '收集截止前站内/订阅通知', toggle: true, checked: true },
      { key: 'notify-receipt', title: '发布提醒', desc: '排班发布后通知', toggle: true, checked: true },
      { key: 'privacy', title: '隐私与安全', desc: '手机号脱敏 · 数据权限', icon: '⛨', iconClass: 'privacy' },
      { key: 'about', title: '关于小程序', desc: '版本 · 协议 · 反馈', icon: 'ⓘ', iconClass: 'about' },
    ],
  },

  onLoad() {
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 });
    } catch (e) {}
  },

  onShow() {
    this.refresh();
  },

  applyUser(u) {
    const nickname = (u && (u.nickname || u.nickName)) || '微信用户';
    const initial = (u && u.initial) || nickname.charAt(0) || '我';
    this.setData({
      user: Object.assign({}, this.data.user, {
        id: (u && (u.id || u.userId)) || '',
        nickname,
        initial,
        avatarUrl: (u && (u.avatarUrl || u.avatar)) || '',
      }),
    });
  },

  mapGroup(g) {
    const role = g.roleInGroup || g.myRole || g.role || 'member';
    const isPub = role === 'publisher' || role === 'owner';
    const name = g.name || '未命名分组';
    return {
      id: g.id,
      name,
      abbr: name.slice(0, 2),
      role: isPub ? 'publisher' : 'member',
      memberCount: g.memberCount != null ? g.memberCount : g.membersCount || 0,
      themeBg: isPub ? 'rgba(43, 109, 229, 0.12)' : 'rgba(43, 109, 229, 0.06)',
      themeColor: '#2B6DE5',
    };
  },

  async refresh() {
    this.setData({ loading: true });
    const cached = (app.globalData && (app.globalData.user || app.globalData.currentUser)) || null;
    if (cached) this.applyUser(cached);
    try {
      await ensureLogin().catch(() => null);
      const live = (app.globalData && (app.globalData.user || app.globalData.currentUser)) || cached;
      if (live) this.applyUser(live);

      const [list, inboxRes, catalog] = await Promise.all([
        groupsApi.listMine().catch(() => []),
        notifyApi.listInbox({ page: 1, pageSize: 20 }).catch(() => ({ items: [], unreadCount: 0 })),
        notifyApi.getTemplates().catch(() => ({ mode: 'inbox_only', wxSubscribeEnabled: false })),
      ]);

      const groups = (list || []).map((g) => this.mapGroup(g));
      const publishCount = groups.filter((g) => g.role === 'publisher').length;
      const inbox = inboxRes.items || [];
      const unread = inboxRes.unreadCount || 0;
      const mode = (catalog && catalog.mode) || 'inbox_only';
      const toolsMenu = this.data.toolsMenu.map((m) => {
        if (m.key === 'inbox') return Object.assign({}, m, { badge: unread > 0 ? unread : 0, desc: unread ? `${unread} 条未读` : '发布与截止提醒' });
        if (m.key === 'notify') {
          return Object.assign({}, m, {
            desc: mode === 'wechat_subscribe' ? '已配置微信模板，点击开启' : '当前为站内消息模式',
          });
        }
        return m;
      });

      this.setData({
        loading: false,
        groups,
        inbox,
        inboxUnread: unread,
        notifyMode: mode,
        notifyModeLabel: mode === 'wechat_subscribe' ? '微信订阅 + 站内' : '仅站内消息',
        toolsMenu,
        user: Object.assign({}, this.data.user, {
          groupsCount: groups.length,
          tasksCount: groups.reduce((s, g) => s + (g.activeTaskCount || 0), 0),
        }),
        stats: {
          publishCount,
          participateCount: groups.length,
          hoursTotal: this.data.stats.hoursTotal || 0,
        },
      });
    } catch (_) {
      this.setData({
        loading: false,
        groups: [],
        inbox: [],
        inboxUnread: 0,
        user: Object.assign({}, this.data.user, { groupsCount: 0, tasksCount: 0 }),
        stats: { publishCount: 0, participateCount: 0, hoursTotal: 0 },
      });
    }
  },

  enterGroup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/group-detail/group-detail?id=${id}` });
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/join/join?mode=manage' });
  },

  goEditProfile() {
    wx.showToast({ title: '编辑资料开发中', icon: 'none' });
  },

  async onMenuTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'calendar') {
      wx.switchTab({ url: '/pages/schedule/schedule' });
      return;
    }
    if (key === 'share') {
      wx.navigateTo({ url: '/pages/join/join?mode=manage' });
      return;
    }
    if (key === 'inbox') {
      // 已在本页展示列表，滚到消息区
      wx.pageScrollTo({ selector: '.inbox-section', duration: 200 });
      return;
    }
    if (key === 'notify') {
      await this.enableNotify();
      return;
    }
    if (key === 'about') {
      wx.showModal({
        title: '排班协同',
        content: '主链路联调版。通知支持站内消息；配置微信订阅模板 ID 后可弹系统订阅。',
        showCancel: false,
      });
      return;
    }
    wx.showToast({ title: '功能即将上线', icon: 'none' });
  },

  async enableNotify() {
    try {
      await ensureLogin();
      const res = await notifyApi.subscribe({ scene: 'all' });
      const title =
        res.mode === 'wechat_subscribe'
          ? res.accepted && res.accepted.length
            ? '已授权微信订阅'
            : '已发起订阅（可在设置中管理）'
          : '已开启站内提醒';
      wx.showToast({ title, icon: 'none', duration: 2200 });
      this.refresh();
    } catch (_) {
      wx.showToast({ title: '开启失败', icon: 'none' });
    }
  },

  async onInboxTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await notifyApi.readInbox(id);
      const inbox = this.data.inbox.map((m) =>
        String(m.id) === String(id) ? Object.assign({}, m, { read: true, isRead: 1 }) : m
      );
      const unread = inbox.filter((m) => !m.read).length;
      const toolsMenu = this.data.toolsMenu.map((m) =>
        m.key === 'inbox' ? Object.assign({}, m, { badge: unread, desc: unread ? `${unread} 条未读` : '发布与截止提醒' }) : m
      );
      this.setData({ inbox, inboxUnread: unread, toolsMenu });
    } catch (_) {}
  },

  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const settingsMenu = this.data.settingsMenu.map((m) =>
      m.key === key ? Object.assign({}, m, { checked: value }) : m
    );
    this.setData({ settingsMenu });
    // 打开时尝试订阅
    if (value && (key === 'notify-task' || key === 'notify-receipt')) {
      const scene = key === 'notify-task' ? 'deadline' : 'publish';
      notifyApi.subscribe({ scene }).catch(() => {});
    }
  },
});
