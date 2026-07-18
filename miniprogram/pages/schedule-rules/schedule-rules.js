// pages/schedule-rules/schedule-rules.js —— 排班规则页（规则化处理）
// 流程：cal-edit（基础设置+网格勾选）→ 本页（详细规则）→ member-preset（人员设置）
Page({
  data: {
    // 从上一页传入的参数
    style: 'time',
    startTime: '08:00',
    endTime: '18:00',
    interval: 60,
    minPeople: 1,
    maxPerWeek: '',
    durationWeeks: 1,
    allowContinuous: false,
    minRestHours: 0,
    dateStart: '',
    dateEnd: '',
    // 本页规则参数
    periods: [],          // 从 startTime/endTime/interval 生成的时段列表
    maxPerPeriod: 1,      // 每个时段最大人数（默认与最少人数一致）
    priorityMode: 'fair', // 排班优先级：fair 平均 / senior 优先老成员 / random 随机
    priorityOptions: [
      { key: 'fair', label: '平均分配', desc: '每人值班次数尽量均等' },
      { key: 'senior', label: '老成员优先', desc: '优先排老成员，新成员补位' },
      { key: 'random', label: '随机分配', desc: '完全随机，保证每人有机会' }
    ],
    allowSwap: true,      // 允许成员自行换班
    autoFill: true        // 自动填充空缺（从可用人员中补位）
  },

  onLoad(opts) {
    // 接收上一页参数
    this.setData({
      style: opts.style || 'time',
      startTime: opts.startTime || '08:00',
      endTime: opts.endTime || '18:00',
      interval: +opts.interval || 60,
      minPeople: +opts.minPeople || 1,
      maxPerWeek: opts.maxPerWeek || '',
      durationWeeks: +opts.durationWeeks || 1,
      allowContinuous: opts.allowContinuous === 'true',
      minRestHours: +opts.minRestHours || 0,
      dateStart: opts.dateStart || '',
      dateEnd: opts.dateEnd || '',
      maxPerPeriod: +opts.minPeople || 1
    })
    this.buildPeriods()
  },

  // 根据开始/结束时间和间隔生成时段列表
  buildPeriods() {
    const { startTime, endTime, interval } = this.data
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    const periods = []
    let cur = startMin
    let idx = 1
    while (cur + interval <= endMin) {
      periods.push({
        id: `p${idx}`,
        label: `${this.min2str(cur)}-${this.min2str(cur + interval)}`,
        start: cur,
        end: cur + interval,
        maxPeople: this.data.maxPerPeriod
      })
      cur += interval
      idx++
    }
    this.setData({ periods })
  },

  min2str(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  },

  // 每个时段最大人数（统一调整）
  incMaxPerPeriod() {
    this.setData({ maxPerPeriod: Math.min(20, this.data.maxPerPeriod + 1) }, () => this.syncPeriodsMax())
  },
  decMaxPerPeriod() {
    this.setData({ maxPerPeriod: Math.max(1, this.data.maxPerPeriod - 1) }, () => this.syncPeriodsMax())
  },
  syncPeriodsMax() {
    const periods = this.data.periods.map(p => ({ ...p, maxPeople: this.data.maxPerPeriod }))
    this.setData({ periods })
  },

  // 单个时段最大人数调整
  incPeriodMax(e) {
    const idx = e.currentTarget.dataset.idx
    const periods = this.data.periods.map((p, i) =>
      i === idx ? { ...p, maxPeople: Math.min(20, p.maxPeople + 1) } : p
    )
    this.setData({ periods })
  },
  decPeriodMax(e) {
    const idx = e.currentTarget.dataset.idx
    const periods = this.data.periods.map((p, i) =>
      i === idx ? { ...p, maxPeople: Math.max(1, p.maxPeople - 1) } : p
    )
    this.setData({ periods })
  },

  pickPriority(e) {
    this.setData({ priorityMode: e.currentTarget.dataset.key })
  },
  toggleSwap(e) {
    this.setData({ allowSwap: e.detail.value })
  },
  toggleAutoFill(e) {
    this.setData({ autoFill: e.detail.value })
  },

  onPrev() {
    wx.navigateBack()
  },

  onNext() {
    if (this.data.periods.length === 0) {
      wx.showToast({ title: '请先在上一页配置时段', icon: 'none' })
      return
    }
    // 进入人员设置页，携带全部参数
    const periodRules = this.data.periods.map(p => `${p.id}:${p.maxPeople}`).join(',')
    const params = `style=${this.data.style}&startTime=${this.data.startTime}&endTime=${this.data.endTime}&interval=${this.data.interval}&minPeople=${this.data.minPeople}&maxPerWeek=${this.data.maxPerWeek}&durationWeeks=${this.data.durationWeeks}&allowContinuous=${this.data.allowContinuous}&minRestHours=${this.data.minRestHours}&dateStart=${this.data.dateStart}&dateEnd=${this.data.dateEnd}&maxPerPeriod=${this.data.maxPerPeriod}&priorityMode=${this.data.priorityMode}&allowSwap=${this.data.allowSwap}&autoFill=${this.data.autoFill}&periodRules=${encodeURIComponent(periodRules)}`
    wx.navigateTo({ url: `/pages/member-preset/member-preset?${params}` })
  }
})
