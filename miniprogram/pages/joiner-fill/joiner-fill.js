// pages/joiner-fill/joiner-fill.js —— 加入者填充页
Page({
  data: {
    taskTitle: '本周实验室值班',
    publisherName: '王老师',
    styleKey: 'time',
    styleLabel: '时间段样式',
    styleIcon: '⏱',
    deadline: '10月8日 23:59',
    hasSubmitted: false,
    statusLabel: '未提交',
    statusKey: 'pending',

    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    rows: [],
    selectedCount: 0,
    totalAvailable: 0
  },

  onLoad(opts) {
    // opts 可能携带 taskId、style 等
    const today = new Date()
    const dayOfWeek = today.getDay() || 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dayOfWeek + 1)
    this.setData({ calWeekStart: this.formatDate(monday) }, () => {
      this.buildWeekDays()
      this.initGrid()
    })
  },

  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  buildWeekDays() {
    const { calWeekStart, weekLabels } = this.data
    const [y, m, d] = calWeekStart.split('-').map(Number)
    const today = new Date()
    const todayStr = this.formatDate(today)
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m - 1, d + i)
      const dateStr = this.formatDate(date)
      days.push({
        key: 'd' + i,
        weekday: weekLabels[i],
        dateShort: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`,
        dateStr,
        isToday: dateStr === todayStr
      })
    }
    const weekEnd = new Date(y, m - 1, d + 6)
    this.setData({
      weekDays: days,
      calWeekLabel: `${calWeekStart} 至 ${this.formatDate(weekEnd)}`
    })
  },

  prevWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number)
    const prev = new Date(y, m - 1, d - 7)
    this.setData({ calWeekStart: this.formatDate(prev) }, () => this.buildWeekDays())
  },

  nextWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number)
    const next = new Date(y, m - 1, d + 7)
    this.setData({ calWeekStart: this.formatDate(next) }, () => this.buildWeekDays())
  },

  // 初始化网格：发布者已勾选的区域 = available=true，加入者可在 available=true 内多选
  initGrid() {
    const startMin = 8 * 60
    const endMin = 22 * 60
    const interval = 120
    const rows = []
    let cur = startMin
    let rowIdx = 0
    while (cur + interval <= endMin) {
      const next = cur + interval
      // 模拟发布者勾选：周一/三/五 全选；周二/四 仅上午；周末仅下午
      const cells = []
      for (let d = 0; d < 7; d++) {
        let available = false
        if (d === 0 || d === 2 || d === 4) available = true
        else if (d === 1 || d === 3) available = rowIdx < 3
        else available = rowIdx >= 3
        cells.push({ available, selected: false })
      }
      rows.push({
        rowIdx,
        start: this.min2str(cur),
        end: this.min2str(next),
        cells
      })
      cur = next
      rowIdx++
    }
    let totalAvailable = 0
    rows.forEach(r => r.cells.forEach(c => { if (c.available) totalAvailable++ }))
    this.setData({ rows, totalAvailable })
  },

  min2str(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  },

  // 点击格子：仅在 available=true 时切换 selected
  onCellTap(e) {
    const r = +e.currentTarget.dataset.row
    const d = +e.currentTarget.dataset.day
    const rows = this.data.rows
    const cell = rows[r].cells[d]
    if (!cell.available) {
      wx.showToast({ title: '该时段不可选', icon: 'none', duration: 600 })
      return
    }
    cell.selected = !cell.selected
    this.setData({ rows }, () => this.updateCount())
  },

  updateCount() {
    let count = 0
    this.data.rows.forEach(r => r.cells.forEach(c => { if (c.selected) count++ }))
    this.setData({ selectedCount: count })
  },

  onSubmit() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请至少选择 1 个时段', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认提交',
      content: `共选择 ${this.data.selectedCount} 个时段，提交后仍可修改或删除`,
      success: (res) => {
        if (res.confirm) {
          this.setData({
            hasSubmitted: true,
            statusLabel: '已提交',
            statusKey: 'submitted'
          })
          wx.showToast({ title: '提交成功', icon: 'success' })
        }
      }
    })
  },

  onSaveEdit() {
    wx.showToast({ title: '修改已保存', icon: 'success', duration: 800 })
  },

  onDeleteSubmit() {
    wx.showModal({
      title: '删除提交',
      content: '删除后发布者将看不到你的可用时间，确定删除吗？',
      confirmColor: '#C77',
      success: (res) => {
        if (res.confirm) {
          const rows = this.data.rows.map(r => ({
            ...r,
            cells: r.cells.map(c => ({ available: c.available, selected: false }))
          }))
          this.setData({
            rows,
            hasSubmitted: false,
            statusLabel: '未提交',
            statusKey: 'pending',
            selectedCount: 0
          })
          wx.showToast({ title: '已删除', icon: 'none' })
        }
      }
    })
  }
})
