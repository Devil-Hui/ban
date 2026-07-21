const api = require('../../utils/api');
const { buildPlanGrid } = require('../../utils/candidate-assignment');
const { formatYmd, formatHm, formatRange } = require('../../utils/time-format');

Page({
  data: {
    taskId: '',
    manage: false,
    schedule: null,
    task: null,
    loading: true,
    grouped: [],
    sending: false,
    planPeriods: [],
    planDates: [],
    planSelectedKeys: [],
    planPeopleByKey: {},
    myUserId: '',
  },

  onLoad(options) {
    const me = wx.getStorageSync('scheduling-user') || {};
    this.setData({
      taskId: options.taskId,
      manage: options.manage === '1',
      myUserId: me.id || '',
    });
    this.load();
  },

  load() {
    Promise.all([
      api.request(`/tasks/${this.data.taskId}/schedule`),
      api.request(`/tasks/${this.data.taskId}`).catch(() => null),
    ])
      .then(([schedule, task]) => {
        const groupedMap = {};
        (schedule.assignments || []).forEach((item) => {
          const date = formatYmd(item.slotDate || item.startsAt);
          const range = formatRange(item.startsAt, item.endsAt);
          const key = `${date}|${range}`;
          if (!groupedMap[key]) {
            groupedMap[key] = {
              key,
              date,
              time: range,
              end: formatHm(item.endsAt),
              names: [],
            };
          }
          groupedMap[key].names.push({
            ...item,
            isMine: item.userId === this.data.myUserId,
          });
        });
        const grouped = Object.values(groupedMap).sort((a, b) =>
          `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
        );

        const grid = buildPlanGrid({
          assignmentList: schedule.assignments || [],
          slots: task?.slots || [],
          highlightUserId: this.data.myUserId,
          dateStart: task?.dateStart,
          dateEnd: task?.dateEnd,
        });
        // Full assignment greens + mine highlighted by ensuring mine keys stay selected
        // and people counts from full grid
        const full = buildPlanGrid({
          assignmentList: schedule.assignments || [],
          slots: task?.slots || [],
          dateStart: task?.dateStart,
          dateEnd: task?.dateEnd,
        });
        const peopleByKey = { ...full.peopleByKey };
        (grid.highlightKeys || []).forEach((key) => {
          // mark mine with same count but keep selected
          peopleByKey[key] = peopleByKey[key] || 1;
        });

        this.setData({
          schedule,
          task,
          grouped,
          planPeriods: full.periods,
          planDates: full.dates,
          planSelectedKeys: full.selectedKeys,
          planPeopleByKey: peopleByKey,
          planHighlightKeys: grid.highlightKeys || [],
          loading: false,
        });
      })
      .catch(() => this.setData({ loading: false }));
  },

  share() {
    if (!this.data.schedule) return;
    this.setData({ sending: true });
    api
      .request(`/tasks/${this.data.taskId}/versions/${this.data.schedule.versionId}/shares`, {
        method: 'POST',
        data: { expiresInHours: 48 },
      })
      .then((share) => {
        const url = `${getApp().globalData.apiBaseUrl}/public/shares/${share.token}`;
        wx.setClipboardData({
          data: url,
          success: () => wx.showToast({ title: '分享链接已复制', icon: 'success' }),
        });
      })
      .catch(() => wx.showToast({ title: '分享链接生成失败', icon: 'none' }))
      .finally(() => this.setData({ sending: false }));
  },

  receipt() {
    if (!this.data.schedule) return;
    api
      .request(`/tasks/${this.data.taskId}/versions/${this.data.schedule.versionId}/receipt`, {
        method: 'POST',
      })
      .then(() => wx.showToast({ title: '已确认排班', icon: 'success' }))
      .catch(() => wx.showToast({ title: '确认失败', icon: 'none' }));
  },

  objection() {
    if (!this.data.schedule) return;
    wx.showModal({
      title: '提交异议',
      editable: true,
      placeholderText: '说明需要调整的原因',
      success: (result) => {
        const reason = (result.content || '').trim();
        if (!result.confirm || !reason) return;
        api
          .request(`/tasks/${this.data.taskId}/versions/${this.data.schedule.versionId}/objections`, {
            method: 'POST',
            data: { reason },
          })
          .then(() => wx.showToast({ title: '异议已提交', icon: 'success' }))
          .catch(() => wx.showToast({ title: '提交失败', icon: 'none' }));
      },
    });
  },
});
