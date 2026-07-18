// pages/join/join.js
Page({
  data: {
    mode: 'join', // join | create
    codeDigits: [
      { value: '' }, { value: '' }, { value: '' },
      { value: '' }, { value: '' }, { value: '' }
    ],
    codeRaw: '',
    activeIndex: 0,
    codeInputFocus: false,
    displayName: '',
    previewGroup: {
      name: '计科202值班群',
      memberCount: 6,
      publisher: '测试用户'
    },

    groupName: '',
    groupNameAbbr: '',
    abbrOptions: ['计科', '值班', '一组', 'A组'],
    cycleRule: 'weekly',
    cycleRules: [
      { key: 'weekly', title: '每周循环', desc: '最常用 · 周一开始' },
      { key: 'odd_weekly', title: '单周循环', desc: '单周生效' },
      { key: 'even_weekly', title: '双周循环', desc: '双周生效' },
      { key: 'custom', title: '自定义', desc: '指定日期范围' }
    ],
    templateId: 't1',
    templates: [
      {
        id: 't1',
        name: '通用时段（推荐）',
        tag: '默认',
        periods: ['08:00-10:00', '10:00-12:00', '14:00-16:00', '16:00-18:00']
      },
      {
        id: 't2',
        name: '课节模式',
        tag: '教育',
        periods: ['08:00-09:40', '10:00-11:40', '14:00-15:40', '16:00-17:40']
      },
      {
        id: 't3',
        name: '自定义时段',
        tag: '空白',
        periods: []
      }
    ],
    myGroups: []
  },

  onLoad(opts) {
    if (opts.mode) {
      this.setData({ mode: opts.mode })
    }
    // 进入加入模式时自动聚焦邀请码输入
    if (opts.mode === 'join' || !opts.mode) {
      setTimeout(() => this.setData({ codeInputFocus: true }), 200)
    }
    // 管理/创建相关：拉真实分组，避免假邀请码误导
    if (opts.mode === 'manage' || opts.mode === 'create') {
      this.loadMyGroups()
    }
  },

  onShow() {
    if (this.data.mode === 'manage' || this.data.mode === 'create') {
      this.loadMyGroups()
    }
  },

  async loadMyGroups() {
    try {
      const groupsApi = require('../../services/groups')
      const { ensureLogin } = require('../../utils/auth')
      await ensureLogin().catch(() => null)
      const list = await groupsApi.listMine()
      const myGroups = (list || []).map((g) => {
        const role = g.roleInGroup || g.myRole || g.role || 'member'
        const isPub = role === 'publisher' || role === 'owner'
        const name = g.name || '未命名分组'
        return {
          id: g.id,
          name,
          abbr: name.slice(0, 2),
          role: isPub ? 'publisher' : 'member',
          inviteCode: g.inviteCode || '',
          themeBg: isPub ? 'rgba(43, 109, 229, 0.12)' : 'rgba(43, 109, 229, 0.06)',
          themeColor: '#2B6DE5',
        }
      })
      this.setData({ myGroups })
    } catch (_) {
      this.setData({ myGroups: [] })
    }
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({
      mode,
      codeInputFocus: mode === 'join'
    })
  },

  // 邀请码输入：点击格子区域聚焦隐藏 input
  onCodeRowTap() {
    this.setData({ codeInputFocus: true })
  },

  onCodeInput(e) {
    const raw = (e.detail.value || '').toUpperCase().slice(0, 6)
    const digits = []
    for (let i = 0; i < 6; i++) {
      digits.push({ value: raw[i] || '' })
    }
    this.setData({
      codeRaw: raw,
      codeDigits: digits,
      activeIndex: Math.min(raw.length, 5)
    })
    // 输入满 6 位自动匹配预览
    if (raw.length === 6) {
      this.matchPreview(raw)
    }
  },

  onCodeBlur() {
    this.setData({ codeInputFocus: false })
  },

  // 根据邀请码匹配预览分组
  matchPreview(code) {
    const matched = this.data.myGroups.find(g => g.inviteCode === code)
    if (matched) {
      this.setData({
        previewGroup: {
          name: matched.name,
          memberCount: 6,
          publisher: '测试用户'
        }
      })
    }
  },

  onNameInput(e) {
    this.setData({ displayName: e.detail.value })
  },

  onGroupNameInput(e) {
    const value = e.detail.value
    const abbr = value.slice(0, 2)
    this.setData({ groupName: value, groupNameAbbr: abbr })
  },

  pickAbbr(e) {
    this.setData({ groupNameAbbr: e.currentTarget.dataset.abbr })
  },

  pickCycle(e) {
    this.setData({ cycleRule: e.currentTarget.dataset.key })
  },

  pickTemplate(e) {
    this.setData({ templateId: e.currentTarget.dataset.id })
  },

  async onJoinSubmit() {
    if (this.data.codeRaw.length < 6) {
      wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' })
      this.setData({ codeInputFocus: true })
      return
    }
    try {
      const groupsApi = require('../../services/groups')
      const { ensureLogin } = require('../../utils/auth')
      await ensureLogin()
      const g = await groupsApi.join({
        inviteCode: this.data.codeRaw,
        displayName: (this.data.displayName || '').trim() || undefined,
      })
      wx.showToast({ title: '加入成功', icon: 'success' })
      const id = g && g.id
      setTimeout(() => {
        if (id) wx.redirectTo({ url: `/pages/group-detail/group-detail?id=${id}` })
        else wx.navigateBack()
      }, 500)
    } catch (_) {}
  },

  async onCreateSubmit() {
    if (!this.data.groupName) {
      wx.showToast({ title: '请填写分组名称', icon: 'none' })
      return
    }
    try {
      const groupsApi = require('../../services/groups')
      const { ensureLogin } = require('../../utils/auth')
      await ensureLogin()
      const g = await groupsApi.create({
        name: this.data.groupName.trim(),
        cycleRule: this.data.cycleRule || 'weekly',
      })
      wx.showToast({ title: '创建成功', icon: 'success' })
      const id = g && g.id
      setTimeout(() => {
        if (id) {
          // 创建后进入模式选择 → 建任务，逻辑链闭环
          wx.redirectTo({
            url: `/pages/style-select/style-select?mode=create&groupId=${id}`,
          })
        } else wx.navigateBack()
      }, 500)
    } catch (_) {}
  },

  copyCode(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  },

  confirmLeave(e) {
    wx.showModal({
      title: '退出分组',
      content: '退出后将无法接收该分组的新任务，历史数据保留，可再次通过邀请码加入。',
      confirmText: '确认退出',
      confirmColor: '#E88B8B',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '已退出分组', icon: 'success' })
        }
      }
    })
  }
})
