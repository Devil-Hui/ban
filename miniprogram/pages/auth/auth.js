// pages/auth/auth.js —— 微信授权登录页（真实授权）
const app = getApp()

Page({
  data: {
    statusBarHeight: 20,
    logging: false,
    // 3 张大型展示卡（不同款式）
    showcaseCards: [
      {
        key: 'calendar',
        tag: '日历视图',
        title: '一眼看清本周排班',
        desc: '周一到周日横向展示，时段按创建原貌呈现',
        // 模拟日历数据
        mockDays: ['一', '二', '三', '四', '五', '六', '日'],
        mockCells: [1, 1, 0, 1, 1, 0, 0]
      },
      {
        key: 'duty',
        tag: '实时值班',
        title: '当前值班人即刻可见',
        desc: '获取当前时间，自动定位正在值班的姓名与手机号',
        mockCurrent: { name: '小红', phone: '138****1234', period: '08:00-10:00' },
        mockNext: { name: '小刚', phone: '139****5678', period: '10:00-12:00' }
      },
      {
        key: 'share',
        tag: '一键分享',
        title: '分享名单给成员确认',
        desc: '选定人员后分享，加入者按名单确认时间表',
        mockMembers: ['红', '刚', '丽', '测']
      }
    ],
    activeCardIdx: 0
  },

  onLoad() {
    try {
      const sysInfo = wx.getWindowInfo()
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    } catch (e) {}

    // 已登录直接跳首页
    if (app.globalData.currentUser) {
      this.goHome()
    }
  },

  // 切换展示卡（魔术贴式左右切换）
  switchCard(e) {
    const idx = e.currentTarget.dataset.idx
    this.setData({ activeCardIdx: idx })
  },

  prevCard() {
    const cur = this.data.activeCardIdx
    this.setData({ activeCardIdx: (cur - 1 + 3) % 3 })
  },

  nextCard() {
    const cur = this.data.activeCardIdx
    this.setData({ activeCardIdx: (cur + 1) % 3 })
  },

  // 真实微信授权登录
  onAuth() {
    if (this.data.logging) return
    this.setData({ logging: true })

    // 1. 先调用 wx.login 获取 code（真实登录凭证）
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          this.setData({ logging: false })
          wx.showModal({
            title: '登录失败',
            content: '微信登录凭证获取失败，请稍后重试',
            showCancel: false
          })
          return
        }
        // 2. 调用 wx.getUserProfile 弹出真实授权弹窗
        wx.getUserProfile({
          desc: '用于展示排班成员的昵称与头像',
          success: (profileRes) => {
            const userInfo = profileRes.userInfo
            const user = {
              id: 'U_' + loginRes.code.slice(0, 8),
              nickname: userInfo.nickName || '微信用户',
              avatarUrl: userInfo.avatarUrl || '',
              openid: 'local_' + loginRes.code.slice(0, 12),
              roles: [],
              loginAt: Date.now()
            }
            app.globalData.currentUser = user
            app.globalData.loginReady = true
            wx.setStorageSync('currentUser', user)
            app.fireLoginReady && app.fireLoginReady()

            wx.showToast({ title: '登录成功', icon: 'success', duration: 600 })
            setTimeout(() => this.goHome(), 600)
          },
          fail: () => {
            this.setData({ logging: false })
            wx.showModal({
              title: '授权已取消',
              content: '需要微信授权才能使用排班功能，请重新点击登录',
              showCancel: false,
              confirmText: '我知道了'
            })
          }
        })
      },
      fail: () => {
        this.setData({ logging: false })
        wx.showModal({
          title: '登录失败',
          content: '网络异常，请检查网络后重试',
          showCancel: false
        })
      }
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
