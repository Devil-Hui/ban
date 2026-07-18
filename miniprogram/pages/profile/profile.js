// pages/profile/profile.js —— 我的：接真实用户与分组，去掉假数据误导
const app = getApp()
const groupsApi = require('../../services/groups')
const { ensureLogin } = require('../../utils/auth')

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    user: {
      nickname: '未登录',
      initial: '我',
      groupsCount: 0,
      tasksCount: 0
    },
    stats: {
      publishCount: 0,
      participateCount: 0,
      hoursTotal: 0
    },
    groups: [],
    toolsMenu: [
      { key: 'calendar', title: '我的日历', desc: '查看排班日程', icon: '▦', iconClass: 'calendar' },
      { key: 'notify', title: '推送设置', desc: '订阅消息、提醒频率', icon: '∘', iconClass: 'notify' },
      { key: 'share', title: '分享与邀请', desc: '邀请码、分享链接管理', icon: '⇪', iconClass: 'share' }
    ],
    settingsMenu: [
      { key: 'notify-task', title: '任务提醒', desc: '截止前 30 分钟通知', toggle: true, checked: true },
      { key: 'notify-receipt', title: '查收提醒', desc: '排班发布后立即通知', toggle: true, checked: true },
      { key: 'notify-objection', title: '异议提醒', desc: '成员异议实时通知', toggle: true, checked: true },
      { key: 'privacy', title: '隐私与安全', desc: '手机号脱敏 · 数据权限', icon: '⛨', iconClass: 'privacy' },
      { key: 'about', title: '关于小程序', desc: '版本 · 协议 · 反馈', icon: 'ⓘ', iconClass: 'about' }
    ]
  },

  onLoad() {
    try {
      const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    } catch (e) {}
  },

  onShow() {
    this.refresh()
  },

  applyUser(u) {
    const nickname = (u && (u.nickname || u.nickName)) || '微信用户'
    const initial = (u && u.initial) || nickname.charAt(0) || '我'
    this.setData({
      user: Object.assign({}, this.data.user, {
        id: (u && (u.id || u.userId)) || '',
        nickname,
        initial,
        avatarUrl: (u && (u.avatarUrl || u.avatar)) || '',
      }),
    })
  },

  mapGroup(g) {
    const role = g.roleInGroup || g.myRole || g.role || 'member'
    const isPub = role === 'publisher' || role === 'owner'
    const name = g.name || '未命名分组'
    return {
      id: g.id,
      name,
      abbr: name.slice(0, 2),
      role: isPub ? 'publisher' : 'member',
      memberCount: g.memberCount != null ? g.memberCount : g.membersCount || 0,
      themeBg: isPub ? 'rgba(43, 109, 229, 0.12)' : 'rgba(43, 109, 229, 0.06)',
      themeColor: '#2B6DE5',
    }
  },

  async refresh() {
    this.setData({ loading: true })
    const cached = (app.globalData && (app.globalData.user || app.globalData.currentUser)) || null
    if (cached) this.applyUser(cached)
    try {
      await ensureLogin().catch(() => null)
      const live = (app.globalData && (app.globalData.user || app.globalData.currentUser)) || cached
      if (live) this.applyUser(live)
      const list = await groupsApi.listMine()
      const groups = (list || []).map((g) => this.mapGroup(g))
      const publishCount = groups.filter((g) => g.role === 'publisher').length
      const participateCount = groups.length
      this.setData({
        loading: false,
        groups,
        user: Object.assign({}, this.data.user, {
          groupsCount: groups.length,
          tasksCount: groups.reduce((s, g) => s + (g.activeTaskCount || 0), 0),
        }),
        stats: {
          publishCount,
          participateCount,
          hoursTotal: this.data.stats.hoursTotal || 0,
        },
      })
    } catch (_) {
      this.setData({
        loading: false,
        groups: [],
        user: Object.assign({}, this.data.user, { groupsCount: 0, tasksCount: 0 }),
        stats: { publishCount: 0, participateCount: 0, hoursTotal: 0 },
      })
    }
  },

  enterGroup(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/group-detail/group-detail?id=${id}` })
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/join/join?mode=manage' })
  },

  goEditProfile() {
    wx.showToast({ title: '编辑资料开发中', icon: 'none' })
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'calendar') {
      wx.switchTab({ url: '/pages/schedule/schedule' })
      return
    }
    if (key === 'share') {
      wx.navigateTo({ url: '/pages/join/join?mode=manage' })
      return
    }
    wx.showToast({ title: '功能即将上线', icon: 'none' })
  },

  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    const settingsMenu = this.data.settingsMenu.map(m =>
      m.key === key ? { ...m, checked: value } : m
    )
    this.setData({ settingsMenu })
  }
})
