// pages/objection/objection.js —— 异议处理（发布者视角）
const app = getApp()

Page({
  data: {
    task: {
      id: 'T001',
      title: '国庆假期值班',
      groupName: '计科202值班群',
      dateRange: '10.01 - 10.07',
      periodCount: 3
    },
    objectionStats: { pending: 2, resolved: 1, total: 3 },
    filter: 'pending',
    objections: [
      {
        id: 'OB01',
        userId: 'U04',
        displayName: '小红',
        initial: '红',
        submittedAt: '10-04 09:12',
        reason: '10月4日要回老家，无法值班，请协助调整或换人',
        involvedShifts: [
          { key: '1', date: '10-04', period: '08:00-10:00' },
          { key: '2', date: '10-04', period: '14:00-16:00' }
        ],
        status: 'pending',
        statusLabel: '待处理'
      },
      {
        id: 'OB02',
        userId: 'U08',
        displayName: '小丽',
        initial: '丽',
        submittedAt: '10-04 11:30',
        reason: '10月5日下午有考试，14:00-16:00 时段无法到岗',
        involvedShifts: [
          { key: '1', date: '10-05', period: '14:00-16:00' }
        ],
        status: 'pending',
        statusLabel: '待处理'
      },
      {
        id: 'OB03',
        userId: 'U06',
        displayName: '小强',
        initial: '强',
        submittedAt: '10-03 16:45',
        reason: '10月2日全天有事，希望调整到其他日期',
        involvedShifts: [
          { key: '1', date: '10-02', period: '08:00-10:00' },
          { key: '2', date: '10-02', period: '10:00-12:00' }
        ],
        status: 'resolved',
        resolvedType: 'accepted',
        resolvedLabel: '已接受·已调整',
        resolvedAt: '10-03 18:20',
        resolveNote: '已为您调整到 10-06',
        statusLabel: '已接受'
      }
    ],
    filteredObjections: [],
    hasPending: true,
    previousSchemes: [
      {
        version: 1,
        title: '初版方案',
        publishedAt: '10-02 15:30',
        shiftsCount: 21,
        reason: '首次发布'
      }
    ],
    // 弹层
    acceptSheet: false,
    rejectSheet: false,
    currentObjection: null,
    resolveNote: '',
    rejectReason: ''
  },

  onLoad() {
    this.applyFilter()
    this.updateStats()
  },

  // 切换筛选
  switchFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter }, () => {
      this.applyFilter()
    })
  },

  applyFilter() {
    const { objections, filter } = this.data
    let list = objections
    if (filter === 'pending') {
      list = objections.filter(o => o.status === 'pending')
    } else if (filter === 'resolved') {
      list = objections.filter(o => o.status === 'resolved')
    }
    this.setData({ filteredObjections: list })
  },

  updateStats() {
    const { objections } = this.data
    const pending = objections.filter(o => o.status === 'pending').length
    this.setData({
      objectionStats: {
        pending,
        resolved: objections.length - pending,
        total: objections.length
      },
      hasPending: pending > 0
    })
  },

  // 接受异议
  acceptObjection(e) {
    const id = e.currentTarget.dataset.id
    const current = this.data.objections.find(o => o.id === id)
    this.setData({
      acceptSheet: true,
      currentObjection: current,
      resolveNote: ''
    })
  },

  closeAcceptSheet() {
    this.setData({ acceptSheet: false, currentObjection: null })
  },

  onNoteInput(e) {
    this.setData({ resolveNote: e.detail.value })
  },

  confirmAccept() {
    const { currentObjection, resolveNote, objections } = this.data
    if (!currentObjection) return
    wx.showLoading({ title: '处理中', mask: true })

    setTimeout(() => {
      wx.hideLoading()
      const updated = objections.map(o => {
        if (o.id === currentObjection.id) {
          return {
            ...o,
            status: 'resolved',
            resolvedType: 'accepted',
            resolvedLabel: '已接受·调整中',
            resolvedAt: this.now(),
            resolveNote: resolveNote || '已接受异议，进入调整模式',
            statusLabel: '已接受'
          }
        }
        return o
      })
      this.setData({
        objections: updated,
        acceptSheet: false,
        currentObjection: null,
        resolveNote: ''
      }, () => {
        this.applyFilter()
        this.updateStats()
      })
      wx.showToast({ title: '已接受，请前往调整', icon: 'success' })
      setTimeout(() => {
        // 实际跳转到方案预览（adjusting 状态）
        // wx.redirectTo({ url: '/pages/scheme-preview/scheme-preview?id=' + this.data.task.id })
      }, 1000)
    }, 600)
  },

  // 驳回异议
  rejectObjection(e) {
    const id = e.currentTarget.dataset.id
    const current = this.data.objections.find(o => o.id === id)
    this.setData({
      rejectSheet: true,
      currentObjection: current,
      rejectReason: ''
    })
  },

  closeRejectSheet() {
    this.setData({ rejectSheet: false, currentObjection: null })
  },

  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value })
  },

  confirmReject() {
    const { currentObjection, rejectReason, objections } = this.data
    if (!currentObjection) return
    if (!rejectReason.trim()) {
      wx.showToast({ title: '请填写驳回理由', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交中', mask: true })

    setTimeout(() => {
      wx.hideLoading()
      const updated = objections.map(o => {
        if (o.id === currentObjection.id) {
          return {
            ...o,
            status: 'resolved',
            resolvedType: 'rejected',
            resolvedLabel: '已驳回',
            resolvedAt: this.now(),
            resolveNote: rejectReason,
            statusLabel: '已驳回'
          }
        }
        return o
      })
      this.setData({
        objections: updated,
        rejectSheet: false,
        currentObjection: null,
        rejectReason: ''
      }, () => {
        this.applyFilter()
        this.updateStats()
      })
      wx.showToast({ title: '已驳回', icon: 'success' })
    }, 600)
  },

  // 全部驳回
  rejectAll() {
    wx.showModal({
      title: '全部驳回',
      content: '确定要驳回所有待处理异议吗？原排班方案将保留。',
      confirmText: '全部驳回',
      confirmColor: '#E57373',
      success: (res) => {
        if (!res.confirm) return
        const { objections } = this.data
        const updated = objections.map(o => {
          if (o.status === 'pending') {
            return {
              ...o,
              status: 'resolved',
              resolvedType: 'rejected',
              resolvedLabel: '已驳回',
              resolvedAt: this.now(),
              resolveNote: '批量驳回',
              statusLabel: '已驳回'
            }
          }
          return o
        })
        this.setData({ objections: updated }, () => {
          this.applyFilter()
          this.updateStats()
        })
        wx.showToast({ title: '已全部驳回', icon: 'success' })
      }
    })
  },

  // 查看历史版本（跳转到方案预览页，按周显示）
  viewVersion(e) {
    const v = e.currentTarget.dataset.version
    wx.navigateTo({ url: `/pages/scheme-preview/scheme-preview?taskId=${this.data.task.id}&version=${v}&mode=history` })
  },

  noop() {},

  now() {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${mi}`
  }
})
