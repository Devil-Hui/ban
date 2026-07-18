// pages/share-preview/share-preview.js —— 分享预览页（发布者选定人名后分享，加入者确认时间表）
Page({
  data: {
    // 来源：publisher（发布者选定人名分享）/ joiner（加入者通过分享链接进入）
    role: 'publisher',
    from: '',
    // 发布者选定的成员名单
    names: [],
    // 分组信息
    groupInfo: {
      id: 'G01',
      name: '计科202值班群',
      initial: '计',
      memberCount: 8,
      taskCount: 5,
      cycleLabel: '每周循环'
    },
    // 任务摘要
    task: {
      id: 'T001',
      title: '国庆假期值班',
      dateRange: '10.01 - 10.07',
      periodCount: 3,
      publishedAt: '10-02 15:30',
      remark: '请提前 10 分钟到岗，值班期间保持电话畅通'
    },
    // 时段配置（按创建时原貌显示）
    periods: [
      { id: 'p1', label: '08:00-10:00', maxPeople: 2 },
      { id: 'p2', label: '10:00-12:00', maxPeople: 2 },
      { id: 'p3', label: '14:00-16:00', maxPeople: 1 }
    ],
    // 按周日历
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    // 时段行 × 7 天单元格
    rows: [],
    // 加入者确认状态
    confirmed: false,
    confirmedAt: ''
  },

  onLoad(options) {
    // 接收参数
    const role = options.role || 'publisher'
    const from = options.from || ''
    let names = []
    if (options.names) {
      names = decodeURIComponent(options.names).split(',').filter(Boolean).map((name, idx) => ({
        id: `n${idx + 1}`,
        name,
        initial: name.slice(-1)
      }))
    }
    this.setData({ role, from, names })

    // 初始化本周日历
    const today = new Date()
    const dayOfWeek = today.getDay() || 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dayOfWeek + 1)
    this.setData({ calWeekStart: this.formatDate(monday) }, () => {
      this.buildWeekDays()
      this.buildRows()
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
        day: date.getDate(),
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
    this.setData({ calWeekStart: this.formatDate(prev) }, () => {
      this.buildWeekDays()
      this.buildRows()
    })
  },

  nextWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number)
    const next = new Date(y, m - 1, d + 7)
    this.setData({ calWeekStart: this.formatDate(next) }, () => {
      this.buildWeekDays()
      this.buildRows()
    })
  },

  // 构建时段行 × 7 天单元格
  // 演示数据：将名单按 day+period 简单分配
  buildRows() {
    const { periods, weekDays, names } = this.data
    const rows = periods.map((p, pi) => {
      const cells = []
      for (let d = 0; d < 7; d++) {
        const dayInfo = weekDays[d] || {}
        const dayNum = dayInfo.day || (d + 1)
        // 演示：用 (dayNum + pi) % 3 决定是否有人
        const hasAssignee = ((dayNum + pi) % 3) !== 0 && names.length > 0
        const assigneeIdx = (dayNum + pi) % Math.max(names.length, 1)
        const assignees = []
        if (hasAssignee) {
          // 演示：根据时段最大人数决定显示几个
          const maxShow = Math.min(p.maxPeople || 1, names.length)
          for (let k = 0; k < maxShow; k++) {
            const n = names[(assigneeIdx + k) % names.length]
            if (n) {
              assignees.push({
                maskedName: this.maskName(n.name),
                maskedPhone: this.maskPhone()
              })
            }
          }
        }
        cells.push({
          dateStr: dayInfo.dateStr || '',
          periodId: p.id,
          assignees
        })
      }
      return {
        rowIdx: pi,
        label: p.label,
        cells
      }
    })
    this.setData({ rows })
  },

  // 姓名脱敏：首字 + 同学
  maskName(name) {
    if (!name) return ''
    return name.charAt(0) + '同学'
  },

  // 手机号脱敏（演示）
  maskPhone() {
    const prefixes = ['138', '139', '136', '135', '137', '188', '189']
    const suffixes = ['1234', '5678', '9012', '3456', '7890', '2468', '1357']
    const p = prefixes[Math.floor(Math.random() * prefixes.length)]
    const s = suffixes[Math.floor(Math.random() * suffixes.length)]
    return `${p}****${s}`
  },

  // 加入者点击"我已确认时间表"
  onConfirm() {
    if (this.data.confirmed) return
    wx.showModal({
      title: '确认时间表',
      content: '确认后，发布者将看到你的可用时间，并据此安排最终排班。是否继续？',
      confirmText: '确认时间表',
      cancelText: '再看看',
      success: (res) => {
        if (res.confirm) {
          const now = new Date()
          const confirmedAt = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
          this.setData({ confirmed: true, confirmedAt })
          wx.showToast({ title: '已确认', icon: 'success', duration: 800 })
          // 跳转到加入者填写可用时间页
          setTimeout(() => {
            wx.redirectTo({
              url: `/pages/joiner-fill/joiner-fill?from=share-confirm&groupId=${this.data.groupInfo.id}`
            })
          }, 800)
        }
      }
    })
  },

  onShareAppMessage() {
    const names = this.data.names.map(n => n.name).join('、')
    return {
      title: `${this.data.groupInfo.name} · ${this.data.task.title}（${names}）`,
      path: `/pages/share-preview/share-preview?role=joiner&from=share&names=${encodeURIComponent(names)}`,
      imageUrl: ''
    }
  }
})
