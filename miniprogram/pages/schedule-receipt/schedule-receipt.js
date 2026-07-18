// pages/schedule-receipt/schedule-receipt.js
Page({
  data: {
    taskId: 'T002',
    task: {
      title: '九月例会排班',
      groupName: '学生会值班',
      total: 4
    },
    receiptProgress: 2,
    totalHours: 8,
    mySchedule: [
      {
        id: 'ms1',
        day: 12, monthLabel: '10月', weekday: '周一',
        periodLabel: '时段 1',
        start: '08:00', end: '10:00',
        coworkers: [{ id: 'u1', initial: '强', name: '小强' }]
      },
      {
        id: 'ms2',
        day: 14, monthLabel: '10月', weekday: '周三',
        periodLabel: '时段 3',
        start: '14:00', end: '16:00',
        coworkers: [{ id: 'u2', initial: '丽', name: '小丽' }]
      }
    ],
    fullSchedule: [
      {
        dateStr: 'd1', day: 12, weekday: '周一',
        periods: [
          { id: 'p1', start: '08:00', end: '10:00', isMine: true, members: [
            { id: 'u3', initial: '测', name: '测试用户', isMe: true },
            { id: 'u1', initial: '强', name: '小强', isMe: false }
          ]},
          { id: 'p2', start: '10:00', end: '12:00', isMine: false, members: [
            { id: 'u2', initial: '丽', name: '小丽', isMe: false }
          ]}
        ]
      },
      {
        dateStr: 'd2', day: 13, weekday: '周二',
        periods: [
          { id: 'p1', start: '08:00', end: '10:00', isMine: false, members: [
            { id: 'u1', initial: '强', name: '小强', isMe: false }
          ]},
          { id: 'p2', start: '10:00', end: '12:00', isMine: false, members: [
            { id: 'u4', initial: '王', name: '小王', isMe: false }
          ]}
        ]
      },
      {
        dateStr: 'd3', day: 14, weekday: '周三',
        periods: [
          { id: 'p3', start: '14:00', end: '16:00', isMine: true, members: [
            { id: 'u3', initial: '测', name: '测试用户', isMe: true },
            { id: 'u2', initial: '丽', name: '小丽', isMe: false }
          ]},
          { id: 'p4', start: '16:00', end: '18:00', isMine: false, members: [
            { id: 'u1', initial: '强', name: '小强', isMe: false }
          ]}
        ]
      }
    ],
    // 按周日历可视化
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekCells: [],
    selectedDayKey: '',
    selectedDayDetail: null,
    receiptStatus: 'pending', // pending | confirmed | objected
    receiptIcon: '?',
    receiptTitle: '待查收',
    receiptDesc: '请确认排班结果，如有问题可提出异议',
    objectionSheet: false,
    objectionType: 'time',
    objectionTypes: [
      { key: 'time', label: '时间冲突' },
      { key: 'person', label: '人员安排' },
      { key: 'count', label: '次数过多' },
      { key: 'other', label: '其他问题' }
    ],
    objectionReason: ''
  },

  onLoad(opts) {
    if (opts.taskId) this.setData({ taskId: opts.taskId })
    // 初始化按周日历：以 fullSchedule 第一天所在周的周一为起点
    const today = new Date()
    const dayOfWeek = today.getDay() || 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dayOfWeek + 1)
    this.setData({ calWeekStart: this.formatDate(monday) }, () => {
      this.buildWeekCalendar()
    })
  },

  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  // 构建按周日历（7 格），将 fullSchedule 数据填充到对应日期
  buildWeekCalendar() {
    const { calWeekStart, fullSchedule, weekLabels } = this.data
    const [y, m, d] = calWeekStart.split('-').map(Number)
    const cells = []
    const today = new Date()
    const todayStr = this.formatDate(today)
    // 将 fullSchedule 按 day 映射（demo 数据使用 12/13/14 号）
    const scheduleByDay = {}
    fullSchedule.forEach(s => { scheduleByDay[s.day] = s })

    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m - 1, d + i)
      const dateStr = this.formatDate(date)
      const dayNum = date.getDate()
      const sched = scheduleByDay[dayNum] || null
      const periodCount = sched ? sched.periods.length : 0
      const hasMine = sched ? sched.periods.some(p => p.isMine) : false
      const allMembers = sched ? sched.periods.flatMap(p => p.members) : []
      const myCount = allMembers.filter(mm => mm.isMe).length
      cells.push({
        key: dateStr,
        date: dateStr,
        day: dayNum,
        monthDay: `${date.getMonth() + 1}/${dayNum}`,
        weekday: weekLabels[i],
        isToday: dateStr === todayStr,
        periodCount,
        hasMine,
        myCount,
        members: allMembers.slice(0, 4),
        schedule: sched
      })
    }
    const weekEnd = new Date(y, m - 1, d + 6)
    this.setData({
      calWeekLabel: `${calWeekStart} 至 ${this.formatDate(weekEnd)}`,
      weekCells: cells
    })
  },

  prevWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number)
    const prev = new Date(y, m - 1, d - 7)
    this.setData({ calWeekStart: this.formatDate(prev) }, () => this.buildWeekCalendar())
  },

  nextWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number)
    const next = new Date(y, m - 1, d + 7)
    this.setData({ calWeekStart: this.formatDate(next) }, () => this.buildWeekCalendar())
  },

  // 点击日历格子查看当天详情
  onWeekCellTap(e) {
    const key = e.currentTarget.dataset.key
    const cell = this.data.weekCells.find(c => c.key === key)
    if (!cell || !cell.schedule) {
      this.setData({ selectedDayKey: key, selectedDayDetail: null })
      return
    }
    this.setData({
      selectedDayKey: key,
      selectedDayDetail: cell.schedule
    })
  },

  closeDayDetail() {
    this.setData({ selectedDayKey: '', selectedDayDetail: null })
  },

  showObjection() {
    this.setData({ objectionSheet: true })
  },

  closeObjection() {
    this.setData({ objectionSheet: false })
  },

  pickType(e) {
    this.setData({ objectionType: e.currentTarget.dataset.key })
  },

  onReasonInput(e) {
    this.setData({ objectionReason: e.detail.value })
  },

  submitObjection() {
    if (!this.data.objectionReason) {
      wx.showToast({ title: '请填写异议说明', icon: 'none' })
      return
    }
    this.setData({
      objectionSheet: false,
      receiptStatus: 'objected',
      receiptIcon: '!',
      receiptTitle: '已提交异议',
      receiptDesc: '发布者将收到通知并处理，请耐心等待'
    })
    wx.showToast({ title: '异议已提交', icon: 'success' })
  },

  confirmReceipt() {
    wx.showModal({
      title: '确认查收',
      content: '确认排班结果无误？查收后将无法再提出异议。',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            receiptStatus: 'confirmed',
            receiptIcon: '✓',
            receiptTitle: '已查收',
            receiptDesc: '排班已确认，可在日程页查看'
          })
          wx.showToast({ title: '查收成功', icon: 'success' })
        }
      }
    })
  }
})
