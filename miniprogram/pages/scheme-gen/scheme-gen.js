// pages/scheme-gen/scheme-gen.js —— 排班方案生成页
// 发布：POST /tasks/{id}/publish（与 scheme-preview / task-detail 统一）
const tasksApi = require('../../services/tasks')
const { ensureLogin } = require('../../utils/auth')

Page({
  data: {
    taskId: '',
    publishing: false,
    mode: 'manual',
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    calWeekStart: '',
    calWeekLabel: '',
    weekDays: [],
    rows: [],
    assignedCount: 0,
    totalCells: 0,
    members: [
      { id: 'u1', name: '小红', initial: '红' },
      { id: 'u2', name: '小刚', initial: '刚' },
      { id: 'u3', name: '小丽', initial: '丽' },
      { id: 'u4', name: '测试用户', initial: '测' }
    ],
    constraints: [
      { id: 'c1', type: 'limit-one', typeLabel: '风险区域限 1 人', detail: '12:00-14:00 时段每格仅 1 人' }
    ],
    // 指派弹层
    assignSheet: false,
    assignInfo: null,
    _assignCell: null,
    // 条件弹层
    consSheet: false,
    consType: 'limit-one',
    limitValue: 1,
    consTypes: [
      { key: 'limit-one', label: '风险区域限 1 人' },
      { key: 'max-day', label: '每人每天上限' },
      { key: 'max-week', label: '每人每周上限' },
      { key: 'fair', label: '平均分配' }
    ]
  },

  onLoad(opts) {
    if (opts && opts.taskId) {
      this.setData({ taskId: opts.taskId })
    }
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

  initGrid() {
    const times = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
    // 风险区域：12:00-14:00 标记为 locked=false 但生成时会限制 1 人
    const rows = times.map((t, rowIdx) => {
      const cells = []
      for (let d = 0; d < 7; d++) {
        // 周末部分格子 locked
        const locked = (d >= 5 && rowIdx >= 5)
        cells.push({ assigned: false, locked, memberName: '', memberId: '' })
      }
      return { rowIdx, start: t, cells }
    })
    let total = 0
    rows.forEach(r => r.cells.forEach(c => { if (!c.locked) total++ }))
    this.setData({ rows, totalCells: total })
  },

  pickMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ mode })
    if (mode === 'random' || mode === 'smart') {
      this.autoGenerate()
    }
  },

  autoGenerate() {
    const members = this.data.members
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map(c => {
        if (c.locked) return c
        // 随机指派
        const m = members[Math.floor(Math.random() * members.length)]
        return { assigned: true, locked: false, memberName: m.name, memberId: m.id }
      })
    }))
    this.setData({ rows }, () => this.updateCount())
    wx.showToast({ title: '已生成方案', icon: 'success', duration: 800 })
  },

  onCellTap(e) {
    const r = +e.currentTarget.dataset.row
    const d = +e.currentTarget.dataset.day
    const cell = this.data.rows[r].cells[d]
    if (cell.locked) {
      wx.showToast({ title: '该格已锁定', icon: 'none' })
      return
    }
    // 弹出成员选择
    const dayLabel = this.data.weekDays[d].weekday
    const timeLabel = this.data.rows[r].start
    const members = this.data.members.map(m => ({
      ...m,
      assigned: cell.assigned && cell.memberId === m.id
    }))
    this.setData({
      assignSheet: true,
      assignInfo: {
        timeLabel,
        dayLabel,
        availableCount: members.length,
        members
      },
      _assignCell: { r, d }
    })
  },

  closeAssign() {
    this.setData({ assignSheet: false, assignInfo: null, _assignCell: null })
  },

  onPickMember(e) {
    const id = e.currentTarget.dataset.id
    const { r, d } = this.data._assignCell
    const rows = this.data.rows
    const cell = rows[r].cells[d]
    const member = this.data.members.find(m => m.id === id)
    if (cell.assigned && cell.memberId === id) {
      // 取消指派
      cell.assigned = false
      cell.memberId = ''
      cell.memberName = ''
    } else {
      cell.assigned = true
      cell.memberId = id
      cell.memberName = member.name
    }
    // 更新弹层
    const members = this.data.assignInfo.members.map(m => ({
      ...m,
      assigned: cell.assigned && cell.memberId === m.id
    }))
    this.setData({
      rows,
      assignInfo: { ...this.data.assignInfo, members }
    }, () => this.updateCount())
  },

  onClearCell() {
    const { r, d } = this.data._assignCell
    const rows = this.data.rows
    const cell = rows[r].cells[d]
    cell.assigned = false
    cell.memberId = ''
    cell.memberName = ''
    const members = this.data.assignInfo.members.map(m => ({ ...m, assigned: false }))
    this.setData({ rows, assignInfo: { ...this.data.assignInfo, members } }, () => this.updateCount())
  },

  updateCount() {
    let count = 0
    this.data.rows.forEach(r => r.cells.forEach(c => { if (c.assigned) count++ }))
    this.setData({ assignedCount: count })
  },

  onReGen() {
    if (this.data.mode === 'manual') {
      // 清空
      const rows = this.data.rows.map(r => ({
        ...r,
        cells: r.cells.map(c => c.locked ? c : { assigned: false, locked: false, memberName: '', memberId: '' })
      }))
      this.setData({ rows, assignedCount: 0 })
      wx.showToast({ title: '已清空', icon: 'none', duration: 600 })
    } else {
      this.autoGenerate()
    }
  },

  // —— 限制条件 ——
  onAddConstraint() {
    this.setData({ consSheet: true, consType: 'limit-one', limitValue: 1 })
  },

  closeCons() {
    this.setData({ consSheet: false })
  },

  pickConsType(e) {
    const key = e.currentTarget.dataset.key
    const defaults = { 'limit-one': 1, 'max-day': 2, 'max-week': 5, 'fair': 1 }
    this.setData({ consType: key, limitValue: defaults[key] || 1 })
  },

  incLimit() {
    this.setData({ limitValue: Math.min(20, this.data.limitValue + 1) })
  },
  decLimit() {
    this.setData({ limitValue: Math.max(1, this.data.limitValue - 1) })
  },

  confirmAddCons() {
    const { consType, limitValue } = this.data
    const labels = {
      'limit-one': { typeLabel: '风险区域限 1 人', detail: `每个风险时段仅 ${limitValue} 人` },
      'max-day': { typeLabel: '每人每天上限', detail: `每人每天最多 ${limitValue} 个时段` },
      'max-week': { typeLabel: '每人每周上限', detail: `每人每周最多 ${limitValue} 个时段` },
      'fair': { typeLabel: '平均分配', detail: `差异不超过 ${limitValue} 个` }
    }
    const item = {
      id: `c${Date.now()}`,
      type: consType,
      typeLabel: labels[consType].typeLabel,
      detail: labels[consType].detail
    }
    this.setData({
      constraints: [...this.data.constraints, item],
      consSheet: false
    })
    wx.showToast({ title: '已添加条件', icon: 'success', duration: 800 })
  },

  removeConstraint(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ constraints: this.data.constraints.filter(c => c.id !== id) })
  },

  /** 从当前 rows 组装 publish.finalSchedule */
  buildFinalScheduleFromRows() {
    const { rows, weekDays } = this.data
    const assignments = []
    ;(rows || []).forEach((row) => {
      ;(row.cells || []).forEach((cell, dIdx) => {
        if (!cell.assigned || !cell.memberId) return
        const date = (weekDays[dIdx] && weekDays[dIdx].dateStr) || ''
        const periodId = 'r' + row.rowIdx
        assignments.push({
          date,
          periodId,
          periodName: row.start || periodId,
          userIds: [cell.memberId],
          userNames: [cell.memberName || ''],
        })
      })
    })
    return {
      schemeName: this.data.mode === 'manual' ? '手动指派方案' : '自动生成方案',
      assignments,
    }
  },

  async onPublish() {
    if (this.data.publishing) return
    if (this.data.assignedCount === 0) {
      wx.showToast({ title: '请先生成方案', icon: 'none' })
      return
    }
    const conf = await wx.showModal({
      title: '确认发布公示',
      content:
        '将发布排班方案给 ' +
        this.data.members.length +
        ' 位成员，发布后所有成员仅可查看',
    })
    if (!conf.confirm) return

    const taskId = this.data.taskId
    // 无真实 taskId：演示跳转
    if (!taskId || String(taskId).indexOf('T00') === 0) {
      wx.showToast({ title: '已发布(演示)', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/public-result/public-result?mode=published',
        })
      }, 400)
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
      }, 400)
    } catch (_) {
      // request 已 toast
    } finally {
      this.setData({ publishing: false })
    }
  },
})
