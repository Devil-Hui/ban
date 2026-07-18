// pages/scheme-preview/scheme-preview.js
// 发布链：确认方案 → POST /tasks/{id}/publish（与 task-detail / scheme-gen 统一）
const tasksApi = require('../../services/tasks');
const { ensureLogin } = require('../../utils/auth');

Page({
  data: {
    taskId: '',
    mode: 'generate', // generate | adjust
    publishing: false,
    regenerating: false,
    task: { title: '国庆假期值班', groupName: '计科202值班群' },
    currentScheme: 0,
    schemes: [
      {
        id: 's1', label: '方案 1',
        totalAssignments: 18, maxPerPerson: 4, score: 8.5,
        uniquePeople: 5, avgPerPerson: '3.6', coverage: 100
      },
      {
        id: 's2', label: '方案 2',
        totalAssignments: 18, maxPerPerson: 5, score: 7.8,
        uniquePeople: 4, avgPerPerson: '4.5', coverage: 100
      },
      {
        id: 's3', label: '方案 3',
        totalAssignments: 16, maxPerPerson: 4, score: 9.2,
        uniquePeople: 5, avgPerPerson: '3.2', coverage: 89
      }
    ],
    currentSchemeData: null,
    warnings: [
      { id: 'w1', text: '10月4日 16:00-18:00 时段仅 1 人可值班', action: '放宽约束' }
    ],
    loadData: [
      { id: 'u1', initial: '红', name: '小红', count: 4, percent: 100 },
      { id: 'u2', initial: '刚', name: '小刚', count: 4, percent: 100 },
      { id: 'u3', initial: '丽', name: '小丽', count: 3, percent: 75 },
      { id: 'u4', initial: '测', name: '测试用户', count: 3, percent: 75 },
      { id: 'u5', initial: '孙', name: '小孙', count: 2, percent: 50 },
      { id: 'u6', initial: '王', name: '小王', count: 2, percent: 50 }
    ],
    // 时段配置（按创建时原貌显示）
    periods: [
      { id: 'p1', start: '08:00', end: '10:00' },
      { id: 'p2', start: '10:00', end: '12:00' },
      { id: 'p3', start: '14:00', end: '16:00' },
      { id: 'p4', start: '16:00', end: '18:00' }
    ],
    // 按周日历
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    // 时段行 × 7 天单元格（横向周一到周日）
    rows: [],
    adjustSheet: false,
    adjustData: null
  },

  onLoad(opts) {
    if (opts.taskId) this.setData({ taskId: opts.taskId })
    if (opts.mode) this.setData({ mode: opts.mode })
    this.setData({ currentSchemeData: this.data.schemes[0] })

    const today = new Date()
    const dayOfWeek = today.getDay() || 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dayOfWeek + 1)
    this.setData({ calWeekStart: this.formatDate(monday) }, () => {
      this.buildWeekDays()
      this.buildScheduleRows()
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
    this.setData({ calWeekStart: this.formatDate(prev) }, () => {
      this.buildWeekDays()
      this.buildScheduleRows()
    })
  },

  nextWeek() {
    const [y, m, d] = this.data.calWeekStart.split('-').map(Number)
    const next = new Date(y, m - 1, d + 7)
    this.setData({ calWeekStart: this.formatDate(next) }, () => {
      this.buildWeekDays()
      this.buildScheduleRows()
    })
  },

  switchScheme(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentScheme: index,
      currentSchemeData: this.data.schemes[index]
    })
    this.buildScheduleRows()
  },

  // 构建时段行 × 7 天单元格
  buildScheduleRows() {
    const { periods, weekDays } = this.data
    const sampleMembers = [
      { id: 'u1', initial: '红' },
      { id: 'u2', initial: '刚' },
      { id: 'u3', initial: '丽' },
      { id: 'u4', initial: '测' }
    ]
    const rows = periods.map((p, pi) => {
      const cells = []
      for (let d = 0; d < 7; d++) {
        const seed = (d + 1 + pi) % 4
        const members = seed === 0 ? [sampleMembers[0], sampleMembers[1]]
          : seed === 1 ? [sampleMembers[2]]
          : seed === 2 ? [sampleMembers[3], sampleMembers[0]]
          : [sampleMembers[1]]
        const urgent = (d === 3 && pi === 3)
        cells.push({
          dateStr: weekDays[d] ? weekDays[d].dateStr : '',
          periodId: p.id,
          members: urgent ? [] : members,
          urgent
        })
      }
      return {
        rowIdx: pi,
        start: p.start,
        end: p.end,
        cells
      }
    })
    this.setData({ rows })
  },

  async regenerate() {
    if (this.data.regenerating) return
    const taskId = this.data.taskId
    // 无真实 taskId 时保留本地演示刷新
    if (!taskId || String(taskId).indexOf('T00') === 0) {
      wx.showLoading({ title: '重新生成中' })
      setTimeout(() => {
        wx.hideLoading()
        wx.showToast({ title: '已生成新方案', icon: 'success' })
        this.buildScheduleRows()
      }, 1200)
      return
    }
    this.setData({ regenerating: true })
    try {
      await ensureLogin()
      wx.showLoading({ title: '提交生成…' })
      const gen = await tasksApi.generate(taskId)
      const jobId = gen.jobId || (gen.job && gen.job.id)
      if (jobId) {
        let i = 0
        while (i++ < 25) {
          const job = await tasksApi.getJob(jobId)
          const st = job.status === 'success' ? 'succeeded' : job.status
          if (st === 'succeeded') {
            wx.hideLoading()
            wx.showToast({ title: '已生成新方案', icon: 'success' })
            // 若后端带回候选，优先用；否则仅刷新本地表
            const cands =
              (job.result && job.result.candidateSchedules) ||
              job.candidateSchedules ||
              []
            if (cands.length) {
              const schemes = cands.map((s, idx) => ({
                id: s.id || ('s' + (idx + 1)),
                label: s.schemeName || ('方案 ' + (idx + 1)),
                totalAssignments: (s.assignments || []).length,
                maxPerPerson: 0,
                score: 0,
                uniquePeople: 0,
                avgPerPerson: '-',
                coverage: 100,
                _raw: s,
              }))
              this.setData({
                schemes,
                currentScheme: 0,
                currentSchemeData: schemes[0],
              })
            }
            this.buildScheduleRows()
            return
          }
          if (st === 'failed') {
            wx.hideLoading()
            wx.showToast({ title: '生成失败', icon: 'none' })
            return
          }
          await new Promise((r) => setTimeout(r, 800))
        }
        wx.hideLoading()
        wx.showToast({ title: '生成超时，请重试', icon: 'none' })
      } else {
        wx.hideLoading()
        // 同步成功（无 jobId）
        wx.showToast({ title: '已生成新方案', icon: 'success' })
        this.buildScheduleRows()
      }
    } catch (_) {
      wx.hideLoading()
    } finally {
      this.setData({ regenerating: false })
    }
  },

  /** 从当前表格 rows 组装后端 publish 所需 finalSchedule */
  buildFinalScheduleFromRows() {
    const scheme = this.data.currentSchemeData || {}
    const raw = scheme._raw
    if (raw && raw.assignments) {
      return {
        schemeName: raw.schemeName || scheme.label || '选定方案',
        assignments: raw.assignments,
      }
    }
    const assignments = []
    const rows = this.data.rows || []
    rows.forEach((row) => {
      (row.cells || []).forEach((cell) => {
        const members = cell.members || []
        if (!members.length) return
        assignments.push({
          date: cell.dateStr,
          periodId: cell.periodId,
          periodName: (row.start || '') + '-' + (row.end || ''),
          userIds: members.map((m) => m.id).filter(Boolean),
          userNames: members.map((m) => m.initial || m.name || ''),
        })
      })
    })
    return {
      schemeName: scheme.label || '选定方案',
      assignments,
    }
  },

  adjustCell(e) {
    const { date, period } = e.currentTarget.dataset
    // 在 rows 中查找对应单元格
    let targetCell = null
    let periodInfo = null
    let dayInfo = null
    for (const row of this.data.rows) {
      if (row.cells[0].periodId === period) {
        periodInfo = this.data.periods.find(p => p.id === period)
        for (let i = 0; i < row.cells.length; i++) {
          if (row.cells[i].dateStr === date) {
            targetCell = row.cells[i]
            dayInfo = this.data.weekDays[i]
            break
          }
        }
        break
      }
    }
    if (!targetCell || !periodInfo || !dayInfo) return
    const candidates = [
      { id: 'u1', initial: '红', name: '小红', weekCount: 3, selected: targetCell.members.some(m => m.id === 'u1') },
      { id: 'u2', initial: '刚', name: '小刚', weekCount: 4, selected: targetCell.members.some(m => m.id === 'u2') },
      { id: 'u3', initial: '丽', name: '小丽', weekCount: 2, selected: targetCell.members.some(m => m.id === 'u3') },
      { id: 'u4', initial: '测', name: '测试用户', weekCount: 3, selected: targetCell.members.some(m => m.id === 'u4') },
      { id: 'u5', initial: '孙', name: '小孙', weekCount: 2, selected: targetCell.members.some(m => m.id === 'u5') }
    ]
    this.setData({
      adjustSheet: true,
      adjustData: {
        date, period,
        dateLabel: `${dayInfo.weekday} ${dayInfo.dateShort}`,
        periodLabel: `${periodInfo.start}-${periodInfo.end}`,
        minPeople: 1,
        currentCount: targetCell.members.length,
        candidates
      }
    })
  },

  toggleCandidate(e) {
    const id = e.currentTarget.dataset.id
    const candidates = this.data.adjustData.candidates.map(c =>
      c.id === id ? { ...c, selected: !c.selected } : c
    )
    this.setData({ 'adjustData.candidates': candidates })
  },

  saveAdjust() {
    wx.showToast({ title: '已保存调整', icon: 'success' })
    this.setData({ adjustSheet: false })
  },

  closeAdjust() {
    this.setData({ adjustSheet: false })
  },

  async confirmScheme() {
    if (this.data.publishing) return
    const scheme = this.data.currentSchemeData
    if (!scheme) {
      wx.showToast({ title: '请先选择方案', icon: 'none' })
      return
    }
    const taskId = this.data.taskId
    const conf = await wx.showModal({
      title: '确认发布',
      content:
        '将「' +
        (scheme.label || '当前方案') +
        '」正式发布给所有成员？成员将收到查收通知。',
    })
    if (!conf.confirm) return

    // 无真实 taskId：保持演示跳转，避免联调阻塞
    if (!taskId || String(taskId).indexOf('T00') === 0) {
      wx.showToast({ title: '已发布(演示)', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/public-result/public-result?mode=published',
        })
      }, 500)
      return
    }

    this.setData({ publishing: true })
    try {
      await ensureLogin()
      const finalSchedule = this.buildFinalScheduleFromRows()
      await tasksApi.publish(taskId, { finalSchedule })
      wx.showToast({ title: '已发布', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url:
            '/pages/public-result/public-result?mode=published&taskId=' +
            encodeURIComponent(taskId),
        })
      }, 500)
    } catch (_) {
      // request 已 toast
    } finally {
      this.setData({ publishing: false })
    }
  },

  goBack() {
    wx.navigateBack()
  },
})
