// pages/style-select/style-select.js
// 三模式入口：时间段 / 节次 / 节次+时间段 → 进入 task-create
const { TIME_MODES } = require('../../constants/time');

Page({
  data: {
    groupId: '',
    styleList: [
      {
        key: 'time',
        timeMode: TIME_MODES.RANGE,
        icon: '⏱',
        title: '时间段样式',
        desc: '按起止时间排班，适合值班/轮岗（纯时间段）',
      },
      {
        key: 'period',
        timeMode: TIME_MODES.SECTION,
        icon: '📖',
        title: '节次样式',
        desc: '以第1节、第2节为单位，适合课表场景',
      },
      {
        key: 'custom',
        timeMode: TIME_MODES.SECTION_RANGE,
        icon: '✦',
        title: '节次 + 时间段',
        desc: '同时显示节次名与时间，校内最常用',
      },
    ],
  },

  onLoad(opts) {
    this.setData({
      groupId: opts.groupId || '',
      mode: opts.mode || 'create',
    });
  },

  onPick(e) {
    const key = e.currentTarget.dataset.key;
    const item = this.data.styleList.find((s) => s.key === key);
    if (!item) return;
    const groupId = this.data.groupId || '';
    const q = [
      `timeMode=${item.timeMode}`,
      groupId ? `groupId=${groupId}` : '',
      `style=${key}`,
    ]
      .filter(Boolean)
      .join('&');
    // 统一进入任务创建向导（不再进 cal-edit 死胡同）
    wx.navigateTo({ url: `/pages/task-create/task-create?${q}` });
  },
});
