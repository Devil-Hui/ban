// pages/publisher-review/publisher-review.js —— 发布者查看加入者填写信息
Page({
  data: {
    totalMembers: 6,
    submittedCount: 4,
    notSubmittedCount: 2,
    notSubmittedList: [
      { id: 'u5', name: '小华', initial: '华' },
      { id: 'u6', name: '小杰', initial: '杰' }
    ],
    submittedList: [
      { id: 'u1', name: '小红', initial: '红', cellCount: 8, submitTime: '今日 09:12' },
      { id: 'u2', name: '小刚', initial: '刚', cellCount: 6, submitTime: '今日 10:35' },
      { id: 'u3', name: '小丽', initial: '丽', cellCount: 10, submitTime: '今日 11:20' },
      { id: 'u4', name: '测试用户', initial: '测', cellCount: 5, submitTime: '今日 14:08' }
    ],
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    rows: [],
    cellDetail: null
  },

  onLoad() {
    const today = new Date()
    const dayOfWeek = today.getDay() || 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dayOfWeek + 1)
    this.setData({ calWeekStart: this.formatDate(monday) }, () => {
      this.buildWeekDays()
      this.initHeatGrid()
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

  // 构建热力网格
  initHeatGrid() {
    const times = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
    // 模拟每个单元格已填写人数（0-4）和成员首字
    const mock = [
      [3, 2, 4, 1, 2, 0, 0],
      [2, 4, 3, 2, 3, 1, 1],
      [1, 2, 2, 3, 2, 0, 0],
      [4, 3, 4, 2, 3, 1, 1],
      [2, 2, 3, 1, 2, 0, 0],
      [1, 1, 2, 2, 1, 0, 0],
      [0, 1, 1, 0, 0, 0, 0]
    ]
    const allMembers = this.data.submittedList
    const rows = times.map((t, rowIdx) => {
      const cells = []
      for (let d = 0; d < 7; d++) {
        const count = mock[rowIdx][d]
        const heatLevel = count === 0 ? 0 : count === 1 ? 1 : count <= 2 ? 2 : 3
        // 取前几位成员首字（演示）
        const topAvatars = allMembers.slice(0, Math.min(count, 3)).map(m => m.initial)
        cells.push({ count, heatLevel, topAvatars })
      }
      return { rowIdx, start: t, cells }
    })
    this.setData({ rows })
  },

  onCellTap(e) {
    const r = +e.currentTarget.dataset.row
    const d = +e.currentTarget.dataset.day
    const row = this.data.rows[r]
    const cell = row.cells[d]
    if (cell.count === 0) {
      wx.showToast({ title: '该时段暂无人填写', icon: 'none', duration: 600 })
      return
    }
    const dayLabel = this.data.weekDays[d].weekday
    const timeLabel = `${row.start} - ${this.plus2h(row.start)}`
    // 演示：随机取若干已提交成员
    const members = this.data.submittedList.slice(0, cell.count).map(m => ({
      id: m.id,
      name: m.name,
      initial: m.initial
    }))
    this.setData({
      cellDetail: {
        timeLabel,
        dayLabel,
        count: cell.count,
        members
      }
    })
  },

  plus2h(time) {
    const [h, m] = time.split(':').map(Number)
    return String((h + 2) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  },

  closeCellDetail() {
    this.setData({ cellDetail: null })
  },

  onRemind(e) {
    const id = e.currentTarget.dataset.id
    wx.showToast({ title: '已提醒', icon: 'success', duration: 800 })
  },

  onViewMember(e) {
    const id = e.currentTarget.dataset.id
    wx.showToast({ title: '查看成员详情', icon: 'none', duration: 600 })
  },

  onBackToEdit() {
    wx.navigateBack()
  },

  onGenerate() {
    // 方案生成走已接 API 的任务详情，避免 scheme-gen mock
    const taskId = this.data.taskId || (this.data.task && this.data.task.id) || '';
    if (taskId) {
      wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${taskId}` });
    } else {
      wx.showToast({ title: '请从任务详情进入生成', icon: 'none' });
    }
  }
})
