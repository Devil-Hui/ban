// pages/public-result/public-result.js —— 公示结果页
Page({
  data: {
    isPublisher: true,
    taskTitle: '本周实验室值班',
    publisherName: '王老师',
    publishTime: '10月8日 18:30',
    styleLabel: '时间段样式',
    assignedCount: 0,
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    rows: [],
    personSummary: [],
    cellDetail: null
  },

  onLoad(opts) {
    // 演示：opts.mode=published 表示从 scheme-gen 跳来
    const today = new Date()
    const dayOfWeek = today.getDay() || 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dayOfWeek + 1)
    this.setData({ calWeekStart: this.formatDate(monday) }, () => {
      this.buildWeekDays()
      this.initGrid()
      this.initPersonSummary()
    })
  },

  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  // 构建 7 天表头（周一到周日）
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

  initGrid() {
    const times = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
    const members = ['红', '刚', '丽', '明']
    // 12:00 和 14:00（rowIdx=2,3）为风险时段
    const riskRows = [2, 3]
    const rows = times.map((t, rowIdx) => {
      const cells = []
      for (let d = 0; d < 7; d++) {
        const locked = (d >= 5 && rowIdx >= 5)
        if (locked) {
          cells.push({ assigned: false, locked: true, memberName: '', riskLevel: 'none' })
        } else {
          // 演示：随机指派
          const m = members[Math.floor(Math.random() * members.length)]
          const isRisk = riskRows.indexOf(rowIdx) >= 0
          cells.push({
            assigned: true,
            locked: false,
            memberName: m,
            memberId: m,
            riskLevel: isRisk ? 'high' : 'normal'
          })
        }
      }
      return { rowIdx, start: t, cells }
    })
    let count = 0
    rows.forEach(r => r.cells.forEach(c => { if (c.assigned) count++ }))
    this.setData({ rows, assignedCount: count })
  },

  initPersonSummary() {
    const summary = [
      { id: 'u1', name: '小红', initial: '红', count: 0 },
      { id: 'u2', name: '小刚', initial: '刚', count: 0 },
      { id: 'u3', name: '小丽', initial: '丽', count: 0 },
      { id: 'u4', name: '测试用户', initial: '测', count: 0 }
    ]
    this.data.rows.forEach(r => {
      r.cells.forEach(c => {
        if (c.assigned) {
          const p = summary.find(s => s.initial === c.memberName)
          if (p) p.count++
        }
      })
    })
    const max = Math.max(...summary.map(s => s.count), 1)
    summary.forEach(s => { s.percent = Math.round(s.count / max * 100) })
    this.setData({ personSummary: summary })
  },

  onCellTap(e) {
    const r = +e.currentTarget.dataset.row
    const d = +e.currentTarget.dataset.day
    const cell = this.data.rows[r].cells[d]
    const dayLabel = this.data.weekDays[d].weekday
    const timeLabel = `${this.data.rows[r].start} - ${this.plus2h(this.data.rows[r].start)}`
    if (cell.assigned) {
      this.setData({
        cellDetail: {
          timeLabel,
          dayLabel,
          assigned: true,
          memberName: cell.memberName,
          riskLabel: cell.riskLevel === 'high' ? '风险时段（限 1 人）' : '正常时段',
          phone: '138****' + (1000 + Math.floor(Math.random() * 9000))
        }
      })
    } else {
      this.setData({
        cellDetail: {
          timeLabel,
          dayLabel,
          assigned: false
        }
      })
    }
  },

  plus2h(time) {
    const [h, m] = time.split(':').map(Number)
    return String((h + 2) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  },

  closeCellDetail() {
    this.setData({ cellDetail: null })
  },

  onEdit() {
    wx.navigateTo({ url: '/pages/scheme-gen/scheme-gen' })
  },

  onShareLink() {
    wx.setClipboardData({
      data: 'https://mp.weixin.qq.com/s/abcdef123456',
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' })
      }
    })
  },

  onShareAppMessage() {
    return {
      title: '排班公示结果：' + this.data.taskTitle,
      path: '/pages/public-result/public-result?mode=view'
    }
  }
})
