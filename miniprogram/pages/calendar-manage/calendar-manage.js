// pages/calendar-manage/calendar-manage.js —— 个人日历管理
const app = getApp()

Page({
  data: {
    calendars: [
      {
        id: 'cal01',
        name: '2026秋季课表',
        source: 'ai_vision',
        cycle: 'weekly',
        cycleLabel: '每周循环',
        slotsCount: 18,
        updatedAt: '07-03 09:20',
        active: true,
        confidence: 92,
        previewSlots: [
          { key: '1', day: '周一', time: '08:00-09:40' },
          { key: '2', day: '周一', time: '10:00-11:40' },
          { key: '3', day: '周二', time: '14:00-15:40' },
          { key: '4', day: '周三', time: '08:00-09:40' }
        ]
      },
      {
        id: 'cal02',
        name: '社团工作日',
        source: 'manual',
        cycle: 'odd_weekly',
        cycleLabel: '单周循环',
        slotsCount: 6,
        updatedAt: '06-28 14:30',
        active: false,
        confidence: null,
        previewSlots: [
          { key: '1', day: '周三', time: '19:00-21:00' },
          { key: '2', day: '周五', time: '19:00-21:00' }
        ]
      }
    ],
    totalSlots: 24,
    aiCount: 1,

    // 弹层状态
    editSheet: false,
    aiSheet: false,
    menuSheet: false,
    menuCalendar: {},

    // 编辑中
    editingCalendar: {
      id: '',
      name: '',
      cycle: 'weekly',
      slotMap: {}
    },

    // 选项
    cycleOptions: [
      { value: 'weekly', label: '每周' },
      { value: 'odd_weekly', label: '单周' },
      { value: 'even_weekly', label: '双周' },
      { value: 'custom', label: '自定义' }
    ],
    daysOptions: [
      { value: '1', label: '周一' },
      { value: '2', label: '周二' },
      { value: '3', label: '周三' },
      { value: '4', label: '周四' },
      { value: '5', label: '周五' },
      { value: '6', label: '周六' },
      { value: '7', label: '周日' }
    ],
    periodSlots: [
      { id: 'p1', label: '08:00' },
      { id: 'p2', label: '10:00' },
      { id: 'p3', label: '14:00' },
      { id: 'p4', label: '16:00' },
      { id: 'p5', label: '19:00' }
    ],

    // 自定义时段
    customDayIdx: 0,
    customStart: '08:00',
    customEnd: '09:00',
    customSlots: [],

    // AI 识别
    aiImage: '',
    aiRecognizing: false,
    aiRecognized: false,
    aiConfidence: 0,
    aiResult: []
  },

  onLoad() {},

  // —— 手动新建 ——
  createManual() {
    this.setData({
      editSheet: true,
      editingCalendar: {
        id: '',
        name: '',
        cycle: 'weekly',
        slotMap: {}
      },
      customSlots: [],
      customDayIdx: 0,
      customStart: '08:00',
      customEnd: '09:00'
    })
  },

  // —— AI 识别新建 ——
  createByAI() {
    this.setData({
      aiSheet: true,
      aiImage: '',
      aiRecognizing: false,
      aiRecognized: false,
      aiConfidence: 0,
      aiResult: [],
      editingCalendar: {
        id: '',
        name: '',
        cycle: 'weekly',
        slotMap: {}
      }
    })
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          aiImage: tempFilePath,
          aiRecognizing: true,
          aiRecognized: false
        })
        // 模拟识别过程
        setTimeout(() => {
          this.setData({
            aiRecognizing: false,
            aiRecognized: true,
            aiConfidence: 88,
            aiResult: [
              { key: '1', day: '周一', periods: [
                { key: '1', time: '08:00-09:40', label: '高等数学' },
                { key: '2', time: '10:00-11:40', label: '英语' }
              ]},
              { key: '2', day: '周二', periods: [
                { key: '1', time: '14:00-15:40', label: '程序设计' }
              ]},
              { key: '3', day: '周三', periods: [
                { key: '1', time: '08:00-09:40', label: '高等数学' },
                { key: '2', time: '10:00-11:40', label: '物理' }
              ]}
            ],
            'editingCalendar.name': '识别的课表'
          })
        }, 1800)
      }
    })
  },

  confirmAICreate() {
    if (!this.data.aiRecognized) {
      wx.showToast({ title: '请先上传图片识别', icon: 'none' })
      return
    }
    if (!this.data.editingCalendar.name.trim()) {
      wx.showToast({ title: '请填写日历名称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '创建中', mask: true })
    setTimeout(() => {
      wx.hideLoading()
      const newCal = {
        id: 'cal' + Date.now(),
        name: this.data.editingCalendar.name,
        source: 'ai_vision',
        cycle: this.data.editingCalendar.cycle,
        cycleLabel: this.cycleLabel(this.data.editingCalendar.cycle),
        slotsCount: this.data.aiResult.reduce((s, r) => s + r.periods.length, 0),
        updatedAt: this.now(),
        active: false,
        confidence: this.data.aiConfidence,
        previewSlots: this.data.aiResult.slice(0, 4).map((r, i) => ({
          key: String(i),
          day: r.day,
          time: r.periods[0].time
        }))
      }
      const list = [newCal, ...this.data.calendars]
      this.setData({
        calendars: list,
        aiSheet: false,
        aiImage: '',
        aiRecognized: false,
        totalSlots: this.data.totalSlots + newCal.slotsCount,
        aiCount: this.data.aiCount + 1
      })
      wx.showToast({ title: '日历已创建', icon: 'success' })
    }, 600)
  },

  closeAISheet() {
    this.setData({ aiSheet: false })
  },

  // —— 打开日历（编辑） ——
  openCalendar(e) {
    const id = e.currentTarget.dataset.id
    const cal = this.data.calendars.find(c => c.id === id)
    if (!cal) return
    this.setData({
      editSheet: true,
      editingCalendar: {
        id: cal.id,
        name: cal.name,
        cycle: cal.cycle,
        slotMap: {}
      }
    })
  },

  // —— 长按菜单 ——
  showCalMenu(e) {
    const id = e.currentTarget.dataset.id
    const cal = this.data.calendars.find(c => c.id === id)
    if (!cal) return
    this.setData({ menuSheet: true, menuCalendar: cal })
  },

  closeMenu() {
    this.setData({ menuSheet: false })
  },

  setDefault() {
    const id = this.data.menuCalendar.id
    const list = this.data.calendars.map(c => ({ ...c, active: c.id === id }))
    this.setData({ calendars: list, menuSheet: false })
    wx.showToast({ title: '已设为默认', icon: 'success' })
  },

  editFromMenu() {
    const id = this.data.menuCalendar.id
    this.setData({ menuSheet: false })
    setTimeout(() => {
      this.openCalendar({ currentTarget: { dataset: { id } } })
    }, 200)
  },

  deleteFromMenu() {
    wx.showModal({
      title: '删除日历',
      content: `确定删除「${this.data.menuCalendar.name}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#E57373',
      success: (res) => {
        if (!res.confirm) return
        const id = this.data.menuCalendar.id
        const list = this.data.calendars.filter(c => c.id !== id)
        const removed = this.data.calendars.find(c => c.id === id)
        this.setData({
          calendars: list,
          menuSheet: false,
          totalSlots: this.data.totalSlots - (removed ? removed.slotsCount : 0),
          aiCount: removed && removed.source === 'ai_vision' ? this.data.aiCount - 1 : this.data.aiCount
        })
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  // —— 编辑弹层 ——
  closeEditSheet() {
    this.setData({ editSheet: false })
  },

  onNameInput(e) {
    this.setData({ 'editingCalendar.name': e.detail.value })
  },

  selectCycle(e) {
    this.setData({ 'editingCalendar.cycle': e.currentTarget.dataset.value })
  },

  toggleSlot(e) {
    const day = e.currentTarget.dataset.day
    const period = e.currentTarget.dataset.period
    const key = day + '_' + period
    const map = { ...this.data.editingCalendar.slotMap }
    if (map[key]) {
      delete map[key]
    } else {
      map[key] = true
    }
    this.setData({ 'editingCalendar.slotMap': map })
  },

  // —— 自定义时段 ——
  onCustomDayChange(e) {
    this.setData({ customDayIdx: +e.detail.value })
  },
  onCustomStartChange(e) {
    this.setData({ customStart: e.detail.value })
  },
  onCustomEndChange(e) {
    this.setData({ customEnd: e.detail.value })
  },
  addCustomSlot() {
    const { customDayIdx, customStart, customEnd, daysOptions } = this.data
    if (customStart >= customEnd) {
      wx.showToast({ title: '结束时间需大于开始', icon: 'none' })
      return
    }
    const day = daysOptions[customDayIdx]
    const key = `c_${day.value}_${customStart}_${customEnd}`
    // 去重
    if (this.data.customSlots.find(s => s.key === key)) {
      wx.showToast({ title: '该时段已添加', icon: 'none' })
      return
    }
    const slot = {
      key,
      day: day.value,
      dayLabel: day.label,
      start: customStart,
      end: customEnd
    }
    this.setData({ customSlots: [...this.data.customSlots, slot] })
  },
  removeCustomSlot(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ customSlots: this.data.customSlots.filter(s => s.key !== key) })
  },

  saveCalendar() {
    const { editingCalendar, customSlots } = this.data
    if (!editingCalendar.name.trim()) {
      wx.showToast({ title: '请填写日历名称', icon: 'none' })
      return
    }
    const gridCount = Object.keys(editingCalendar.slotMap).length
    const customCount = customSlots.length
    const slotsCount = gridCount + customCount
    if (slotsCount === 0) {
      wx.showToast({ title: '请至少选择一个时段', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    setTimeout(() => {
      wx.hideLoading()
      if (editingCalendar.id) {
        // 编辑
        const list = this.data.calendars.map(c => {
          if (c.id === editingCalendar.id) {
            return {
              ...c,
              name: editingCalendar.name,
              cycle: editingCalendar.cycle,
              cycleLabel: this.cycleLabel(editingCalendar.cycle),
              slotsCount,
              updatedAt: this.now()
            }
          }
          return c
        })
        this.setData({ calendars: list, editSheet: false })
      } else {
        // 新建
        const dayMap = { '1': '周一', '2': '周二', '3': '周三', '4': '周四', '5': '周五', '6': '周六', '7': '周日' }
        const periodMap = {}
        this.data.periodSlots.forEach(p => { periodMap[p.id] = p.label })
        const preview = Object.keys(editingCalendar.slotMap).slice(0, 4).map(k => {
          const [d, p] = k.split('_')
          return {
            key: k,
            day: dayMap[d],
            time: periodMap[p] + ':00'
          }
        })
        const newCal = {
          id: 'cal' + Date.now(),
          name: editingCalendar.name,
          source: 'manual',
          cycle: editingCalendar.cycle,
          cycleLabel: this.cycleLabel(editingCalendar.cycle),
          slotsCount,
          updatedAt: this.now(),
          active: this.data.calendars.length === 0,
          confidence: null,
          previewSlots: preview
        }
        const list = [...this.data.calendars, newCal]
        this.setData({
          calendars: list,
          editSheet: false,
          totalSlots: this.data.totalSlots + slotsCount
        })
      }
      wx.showToast({ title: '已保存', icon: 'success' })
    }, 500)
  },

  deleteCalendar() {
    const id = this.data.editingCalendar.id
    wx.showModal({
      title: '删除日历',
      content: '确定删除此日历吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#E57373',
      success: (res) => {
        if (!res.confirm) return
        const list = this.data.calendars.filter(c => c.id !== id)
        const removed = this.data.calendars.find(c => c.id === id)
        this.setData({
          calendars: list,
          editSheet: false,
          totalSlots: this.data.totalSlots - (removed ? removed.slotsCount : 0),
          aiCount: removed && removed.source === 'ai_vision' ? this.data.aiCount - 1 : this.data.aiCount
        })
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  },

  noop() {},

  cycleLabel(v) {
    const map = { weekly: '每周循环', odd_weekly: '单周循环', even_weekly: '双周循环', custom: '自定义' }
    return map[v] || '每周循环'
  },

  now() {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${mi}`
  }
})
