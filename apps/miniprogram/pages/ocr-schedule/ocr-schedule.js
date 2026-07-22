const api = require('../../utils/api');

/** 本周一～周日 */
function thisWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
  const sun = new Date(now); sun.setDate(mon.getDate() + 6);
  const fmt = (d) => `${d.getMonth() + 1}.${d.getDate()}`;
  return `${fmt(mon)} - ${fmt(sun)}`;
}

Page({
  data: {
    imagePath: '',
    recognizing: false,
    recognized: false,
    schedule: [],
    weekRange: thisWeekRange(),
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ imagePath: res.tempFilePaths[0], recognized: false, schedule: [] });
      },
    });
  },

  async startRecognition() {
    if (!this.data.imagePath) return wx.showToast({ title: '请先选择图片', icon: 'none' });
    this.setData({ recognizing: true });
    try {
      const res = await api.uploadFile('/scheduling/ocr-schedule', this.data.imagePath, 'image');
      const schedule = Array.isArray(res) ? res : res?.schedule || [];
      this.setData({ recognized: true, schedule });
      if (!schedule.length) wx.showToast({ title: '未识别到有效课表', icon: 'none' });
    } catch {
      wx.showToast({ title: '识别失败，请重试', icon: 'none' });
    } finally {
      this.setData({ recognizing: false });
    }
  },

  resetResult() {
    this.setData({ imagePath: '', recognized: false, schedule: [] });
  },

  applyAsTemplate() {
    wx.showModal({
      title: '应用为模板',
      content: '将识别结果保存为你的本周可用时段模板？',
      success: (res) => {
        if (!res.confirm) return;
        api.request('/scheduling/ocr-schedule/apply', { method: 'POST', data: { schedule: this.data.schedule } })
          .then(() => {
            wx.showToast({ title: '已应用为时段模板', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1200);
          })
          .catch(() => wx.showToast({ title: '应用失败', icon: 'none' }));
      },
    });
  },
});
