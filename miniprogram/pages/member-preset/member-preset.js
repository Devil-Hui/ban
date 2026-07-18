// pages/member-preset/member-preset.js —— 人员预设页（仅预设人名，无加入申请）
Page({
  data: {
    newName: '',
    presetList: [
      { id: 'p1', name: '小红', initial: '红' },
      { id: 'p2', name: '小刚', initial: '刚' },
      { id: 'p3', name: '小丽', initial: '丽' }
    ]
  },

  onLoad() {},

  onNameInput(e) {
    this.setData({ newName: e.detail.value })
  },

  addMember() {
    const name = (this.data.newName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (this.data.presetList.some(m => m.name === name)) {
      wx.showToast({ title: '该人员已存在', icon: 'none' })
      return
    }
    const id = `p${Date.now()}`
    const initial = name.slice(-1)
    this.setData({
      newName: '',
      presetList: [...this.data.presetList, { id, name, initial }]
    })
    wx.showToast({ title: '已添加', icon: 'success', duration: 600 })
  },

  removeMember(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '移除人员',
      content: '确定要移除该人员吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            presetList: this.data.presetList.filter(m => m.id !== id)
          })
          wx.showToast({ title: '已移除', icon: 'none', duration: 600 })
        }
      }
    })
  },

  onSaveDraft() {
    wx.showToast({ title: '已保存草稿', icon: 'success', duration: 800 })
  },

  // 选定人名后分享给成员
  onShare() {
    if (this.data.presetList.length === 0) {
      wx.showToast({ title: '请先添加预设人员', icon: 'none' })
      return
    }
    const names = this.data.presetList.map(m => m.name).join(',')
    wx.navigateTo({
      url: `/pages/share-preview/share-preview?role=publisher&from=member-preset&names=${encodeURIComponent(names)}`
    })
  },

  onShareAppMessage() {
    return {
      title: '邀请你加入排班：' + (this.data.groupName || '我的排班'),
      path: '/pages/index/index?from=share'
    }
  }
})
