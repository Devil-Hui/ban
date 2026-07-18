// pages/members/members.js
Page({
  data: {
    memberId: '',
    groupId: '',
    member: {
      id: 'U04',
      initial: '红',
      displayName: '小红',
      role: 'member',
      status: 'active',
      statusLabel: '正常',
      className: '计科202',
      phoneMasked: '138****1234',
      joinedAt: '2026-09-01',
      joinedDays: 100,
      submittedCount: 3,
      assignedCount: 4,
      isBlacklisted: false
    },
    history: [
      { id: 'h1', taskTitle: '国庆假期值班', time: '2026-09-26', slotsCount: 8, valid: true, statusClass: 'success', statusLabel: '有效' },
      { id: 'h2', taskTitle: '九月例会排班', time: '2026-09-08', slotsCount: 5, valid: true, statusClass: 'success', statusLabel: '已排班' },
      { id: 'h3', taskTitle: '暑期值班安排', time: '2026-07-15', slotsCount: 12, valid: false, statusClass: 'invalid', statusLabel: '已归档' }
    ],
    auditLogs: [
      { id: 'a1', icon: '⇪', iconClass: 'join', action: '加入分组', time: '2026-09-01 10:30', operator: '自行加入', reason: '' }
    ],
    kickSheet: false,
    kickReason: '',
    willBlacklist: false
  },

  onLoad(opts) {
    if (opts.id) this.setData({ memberId: opts.id })
    if (opts.groupId) this.setData({ groupId: opts.groupId })
    if (opts.action === 'kick') {
      setTimeout(() => this.showKickSheet(), 300)
    }
  },

  viewFullPhone() {
    wx.showModal({
      title: '查看完整手机号',
      content: '完整手机号将在 30 秒后自动隐藏，请勿截屏传播。',
      confirmText: '我已了解',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '138 1234 1234', icon: 'none', duration: 3000 })
        }
      }
    })
  },

  reopenSubmit() {
    wx.showModal({
      title: '重开提交',
      content: '将重置该成员的所有空闲时间提交，他会收到推送重新填写。',
      success: (res) => {
        if (res.confirm) wx.showToast({ title: '已重开提交', icon: 'success' })
      }
    })
  },

  showKickSheet() {
    this.setData({ kickSheet: true })
  },
  closeKickSheet() {
    this.setData({ kickSheet: false })
  },
  onKickReasonInput(e) {
    this.setData({ kickReason: e.detail.value })
  },
  toggleBlacklist() {
    this.setData({ willBlacklist: !this.data.willBlacklist })
  },
  onBlacklistChange(e) {
    this.setData({ willBlacklist: e.detail.value })
  },
  confirmKick() {
    if (!this.data.kickReason) {
      wx.showToast({ title: '请填写踢出原因', icon: 'none' })
      return
    }
    wx.showToast({ title: '已踢出', icon: 'success' })
    setTimeout(() => {
      this.setData({
        kickSheet: false,
        'member.status': 'kicked',
        'member.statusLabel': this.data.willBlacklist ? '已拉黑' : '已踢出',
        'member.isBlacklisted': this.data.willBlacklist
      })
    }, 800)
  },
  unblacklist() {
    wx.showModal({
      title: '解除黑名单',
      content: '解除后该成员可通过邀请码重新加入分组。',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'member.isBlacklisted': false,
            'member.statusLabel': '已踢出'
          })
          wx.showToast({ title: '已解除黑名单', icon: 'success' })
        }
      }
    })
  }
})
