// pages/cal-edit-time/cal-edit-time.js —— 时间段日历编辑页（增强版）
Page({
  data: {
    startTime: '08:00',
    endTime: '18:00',
    // 结束时间快捷选项（基于开始时间的时长）
    endDuration: 8,  // 默认 8 小时
    endDurationOptions: [
      { value: 2, label: '2小时' },
      { value: 4, label: '4小时' },
      { value: 6, label: '6小时' },
      { value: 8, label: '8小时' },
      { value: 10, label: '10小时' },
      { value: 12, label: '12小时' },
      { value: 0, label: '自定义' }
    ],
    interval: 60,  // 分钟
    intervalOptions: [
      { value: 15, label: '15分钟' },
      { value: 30, label: '30分钟' },
      { value: 45, label: '45分钟' },
      { value: 60, label: '1小时' },
      { value: 90, label: '1.5小时' },
      { value: 120, label: '2小时' }
    ],
    // 人员约束
    minPeople: 1,
    maxPerWeek: null,  // null = 不限
    // 排班持续周数（原"排班周期"，重命名为更清晰概念）
    durationWeeks: 1,
    durationOptions: [
      { key: 'w1', value: 1, label: '1周' },
      { key: 'w2', value: 2, label: '2周' },
      { key: 'w4', value: 4, label: '4周' },
      { key: 'w8', value: 8, label: '8周' }
    ],
    // 是否允许同一人连续值班（相邻时段）
    allowContinuous: false,
    // 班次间最短休息时间（小时）
    minRestHours: 0,
    minRestOptions: [
      { value: 0, label: '无要求' },
      { value: 1, label: '1小时' },
      { value: 2, label: '2小时' },
      { value: 4, label: '4小时' }
    ],
    // 日期范围
    dateStart: '',
    dateEnd: '',
    // 含周末
    includeWeekend: true,
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
    // 初始化默认日期范围：今天 → 今天+7天
    const today = new Date()
    const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    this.setData({
      dateStart: this.fmtDate(today),
      dateEnd: this.fmtDate(end)
    })
    this.generateGrid()
  },

  fmtDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  onStartChange(e) {
    const startTime = e.detail.value
    // 同步更新结束时间（保持时长或自定义）
    this.setData({ startTime }, () => {
      if (this.data.endDuration > 0) this.applyEndDuration()
      this.generateGrid()
    })
  },
  onEndChange(e) {
    // 自定义结束时间
    this.setData({ endTime: e.detail.value, endDuration: 0 }, () => this.generateGrid())
  },
  // 快捷选择结束时间（基于开始时间的时长）
  pickEndDuration(e) {
    const hours = +e.currentTarget.dataset.value
    if (hours === 0) {
      // 自定义：保留当前 endTime，仅切换状态
      this.setData({ endDuration: 0 })
    } else {
      this.setData({ endDuration: hours }, () => {
        this.applyEndDuration()
        this.generateGrid()
      })
    }
  },
  applyEndDuration() {
    const { startTime, endDuration } = this.data
    const [sh, sm] = startTime.split(':').map(Number)
    let eh = sh + endDuration
    if (eh > 23) eh = 23
    const endTime = `${String(eh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`
    this.setData({ endTime })
  },
  pickInterval(e) {
    const value = +e.currentTarget.dataset.value
    this.setData({ interval: value }, () => this.generateGrid())
  },

  // 人员约束计数器
  incMinPeople() {
    this.setData({ minPeople: Math.min(20, this.data.minPeople + 1) })
  },
  decMinPeople() {
    this.setData({ minPeople: Math.max(1, this.data.minPeople - 1) })
  },
  incMaxWeek() {
    if (this.data.maxPerWeek === null) this.setData({ maxPerWeek: 1 })
    else this.setData({ maxPerWeek: Math.min(14, this.data.maxPerWeek + 1) })
  },
  decMaxWeek() {
    if (this.data.maxPerWeek === null) return
    if (this.data.maxPerWeek <= 1) this.setData({ maxPerWeek: null })
    else this.setData({ maxPerWeek: this.data.maxPerWeek - 1 })
  },
  toggleMaxWeek() {
    this.setData({ maxPerWeek: this.data.maxPerWeek === null ? 1 : null })
  },

  // 排班持续周数
  pickDuration(e) {
    this.setData({ durationWeeks: +e.currentTarget.dataset.value })
  },

  // 允许连续值班开关
  toggleContinuous(e) {
    this.setData({ allowContinuous: e.detail.value })
  },

  // 最短休息时间
  pickMinRest(e) {
    this.setData({ minRestHours: +e.currentTarget.dataset.value })
  },

  // 日期范围
  onDateStart(e) {
    this.setData({ dateStart: e.detail.value })
  },
  onDateEnd(e) {
    this.setData({ dateEnd: e.detail.value })
  },

  // 含周末开关
  toggleWeekend(e) {
    this.setData({ includeWeekend: e.detail.value }, () => this.updateCount())
  },

  // 生成周历网格
  generateGrid() {
    const { startTime, endTime, interval } = this.data
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    if (endMin <= startMin) {
      wx.showToast({ title: '结束需大于开始', icon: 'none' })
      this.setData({ rows: [], totalCells: 0, selectedCount: 0 })
      return
    }
    const rows = []
    let cur = startMin
    let rowIdx = 0
    while (cur + interval <= endMin) {
      const next = cur + interval
      const cells = Array(7).fill(0).map(() => ({ active: false }))
      rows.push({
        rowIdx,
        start: this.min2str(cur),
        end: this.min2str(next),
        cells
      })
      cur = next
      rowIdx++
    }
    // 默认演示：让前 2 行 1-3 列变蓝
    if (rows.length >= 2) {
      rows[0].cells[0].active = true
      rows[0].cells[2].active = true
      rows[1].cells[1].active = true
    }
    this.setData({ rows, totalCells: rows.length * 7 }, () => this.updateCount())
  },

  min2str(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  },

  // 点击格子切换
  toggleCell(e) {
    const r = +e.currentTarget.dataset.row
    const d = +e.currentTarget.dataset.day
    // 周末过滤
    if (!this.data.includeWeekend && (d === 5 || d === 6)) return
    const rows = this.data.rows
    rows[r].cells[d].active = !rows[r].cells[d].active
    this.setData({ rows }, () => this.updateCount())
  },

  // 工具栏：清空
  onClearAll() {
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map((c, i) => {
        if (!this.data.includeWeekend && (i === 5 || i === 6)) return c
        return { active: false }
      })
    }))
    this.setData({ rows }, () => this.updateCount())
    wx.showToast({ title: '已清空', icon: 'none', duration: 600 })
  },

  // 工具栏：全选
  onFillAll() {
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map((c, i) => {
        if (!this.data.includeWeekend && (i === 5 || i === 6)) return { active: false }
        return { active: true }
      })
    }))
    this.setData({ rows }, () => this.updateCount())
    wx.showToast({ title: '已全选', icon: 'none', duration: 600 })
  },

  // 工具栏：反选
  onInvert() {
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map((c, i) => {
        if (!this.data.includeWeekend && (i === 5 || i === 6)) return c
        return { active: !c.active }
      })
    }))
    this.setData({ rows }, () => this.updateCount())
    wx.showToast({ title: '已反选', icon: 'none', duration: 600 })
  },

  // 工具栏：下滑排版
  onSwipeDown() {
    this.setData({ swipeGuide: true })
  },

  closeSwipeGuide() {
    this.setData({ swipeGuide: false })
    // 演示：将周三（idx=2）整列填蓝
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map((c, i) => i === 2 ? { active: true } : c)
    }))
    this.setData({ rows }, () => {
      this.updateCount()
      wx.showToast({ title: '已将周三填蓝', icon: 'none', duration: 800 })
    })
  },

  // 工具栏：随机填充
  onRandomFill() {
    const rows = this.data.rows.map(r => ({
      ...r,
      cells: r.cells.map((c, i) => {
        if (!this.data.includeWeekend && (i === 5 || i === 6)) return { active: false }
        return { active: Math.random() > 0.55 }
      })
    }))
    this.setData({ rows }, () => this.updateCount())
    wx.showToast({ title: '已随机填充', icon: 'none', duration: 600 })
  },

  updateCount() {
    let count = 0
    let total = 0
    this.data.rows.forEach(r => r.cells.forEach((c, i) => {
      // 仅统计可见格子
      if (this.data.includeWeekend || (i !== 5 && i !== 6)) {
        total++
        if (c.active) count++
      }
    }))
    this.setData({ selectedCount: count, totalCells: total })
  },

  onSaveDraft() {
    wx.showToast({ title: '已保存草稿', icon: 'success', duration: 800 })
  },

  onNext() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请至少选择 1 个时段', icon: 'none' })
      return
    }
    // 进入排班规则页（规则化处理），而非直接到人员设置
    const maxPerWeek = this.data.maxPerWeek === null ? '' : this.data.maxPerWeek
    const params = `style=time&startTime=${this.data.startTime}&endTime=${this.data.endTime}&interval=${this.data.interval}&minPeople=${this.data.minPeople}&maxPerWeek=${maxPerWeek}&durationWeeks=${this.data.durationWeeks}&allowContinuous=${this.data.allowContinuous}&minRestHours=${this.data.minRestHours}&dateStart=${this.data.dateStart}&dateEnd=${this.data.dateEnd}`
    wx.navigateTo({ url: `/pages/schedule-rules/schedule-rules?${params}` })
  }
})
