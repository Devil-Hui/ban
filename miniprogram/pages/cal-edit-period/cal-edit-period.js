// pages/cal-edit-period/cal-edit-period.js —— 节次日历编辑页
const CN_NUM = ['零','一','二','三','四','五','六','七','八','九','十','十一','十二']

Page({
  data: {
    periodCount: 4,
    startTime: '08:00',
    durationIdx: 1,
    durationOptions: [
      { value: 45, label: '45 分钟' },
      { value: 60, label: '60 分钟' },
      { value: 90, label: '90 分钟' },
      { value: 120, label: '120 分钟' }
    ],
    weekDays: [
      { idx: 0, key: 'mon', weekday: '周一', dateShort: '10/05', isToday: false },
      { idx: 1, key: 'tue', weekday: '周二', dateShort: '10/06', isToday: false },
      { idx: 2, key: 'wed', weekday: '周三', dateShort: '10/07', isToday: true },
      { idx: 3, key: 'thu', weekday: '周四', dateShort: '10/08', isToday: false },
      { idx: 4, key: 'fri', weekday: '周五', dateShort: '10/09', isToday: false },
      { idx: 5, key: 'sat', weekday: '周六', dateShort: '10/10', isToday: false },
      { idx: 6, key: 'sun', weekday: '周日', dateShort: '10/11', isToday: false }
    ],
    rows: [],
    selectedCount: 0,
    totalCells: 0,
    swipeGuide: false
  },

  onLoad() {
    this.generateGrid()
  },

  incPeriod() {
    if (this.data.periodCount >= 12) return
    this.setData({ periodCount: this.data.periodCount + 1 }, () => this.generateGrid())
  },
  decPeriod() {
    if (this.data.periodCount <= 1) return
    this.setData({ periodCount: this.data.periodCount - 1 }, () => this.generateGrid())
  },
  onDurationChange(e) {
    this.setData({ durationIdx: +e.detail.value }, () => this.generateGrid())
  },
  onStartChange(e) {
    this.setData({ startTime: e.detail.value }, () => this.generateGrid())
  },

  generateGrid() {
    const { periodCount, startTime, durationIdx, durationOptions } = this.data
    const duration = durationOptions[durationIdx].value
    const [sh, sm] = startTime.split(':').map(Number)
    let cur = sh * 60 + sm
    const rows = []
    for (let i = 1; i <= periodCount; i++) {
      const next = cur + duration
      const cells = Array(7).fill(0).map(() => ({ active: false }))
      rows.push({
        rowIdx: i - 1,
        cnIdx: CN_NUM[i],
        start: this.min2str(cur),
        end: this.min2str(next),
        cells
      })
      cur = next
    }
    // 演示数据
    if (rows.length >= 2) {
      rows[0].cells[0].active = true
      rows[0].cells[4].active = true
      rows[1].cells[2].active = true
    }
    this.setData({ rows, totalCells: rows.length * 7 }, () => this.updateCount())
  },

  min2str(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  },

  toggleCell(e) {
    const r = +e.currentTarget.dataset.row
    const d = +e.currentTarget.dataset.day
    const rows = this.data.rows
    rows[r].cells[d].active = !rows[r].cells[d].active
    this.setData({ rows }, () => this.updateCount())
  },

  onClearAll() {
    const rows = this.data.rows.map(r => ({ ...r, cells: r.cells.map(c => ({ active: false })) }))
    this.setData({ rows }, () => this.updateCount())
    wx.showToast({ title: '已清空', icon: 'none', duration: 600 })
  },
  onFillAll() {
    const rows = this.data.rows.map(r => ({ ...r, cells: r.cells.map(c => ({ active: true })) }))
    this.setData({ rows }, () => this.updateCount())
    wx.showToast({ title: '已全选', icon: 'none', duration: 600 })
  },
  onSwipeDown() { this.setData({ swipeGuide: true }) },
  closeSwipeGuide() {
    this.setData({ swipeGuide: false })
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map((c, i) => i === 2 ? { active: true } : c)
    }))
    this.setData({ rows }, () => this.updateCount())
  },
  onRandomFill() {
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map(() => ({ active: Math.random() > 0.55 }))
    }))
    this.setData({ rows }, () => this.updateCount())
  },
  updateCount() {
    let count = 0
    this.data.rows.forEach(r => r.cells.forEach(c => { if (c.active) count++ }))
    this.setData({ selectedCount: count })
  },
  onSaveDraft() {
    wx.showToast({ title: '已保存草稿', icon: 'success', duration: 800 })
  },
  onNext() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请至少选择 1 节', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/member-preset/member-preset?style=period' })
  }
})
