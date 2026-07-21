const api = require('../../utils/api');
const { formatHm, formatDeadline } = require('../../utils/time-format');

function weekday(date) {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function time(value) {
  // Prefer shared wall-clock extraction (avoid TZ shift quirks on Z timestamps)
  return formatHm(value) || '';
}

function currentUser() {
  return wx.getStorageSync('scheduling-user') || getApp()?.globalData?.user || null;
}

function requiredFieldsOf(task) {
  return Array.isArray(task?.rules?.requiredFields) ? task.rules.requiredFields : [];
}

Page({
  data: {
    taskId: '',
    task: null,
    days: [],
    rows: [],
    mode: 'calendar',
    submitted: false,
    loading: true,
    saving: false,
    requiredFields: [],
    needName: false,
    needStudentId: false,
    needPhone: false,
    profileName: '',
    profileStudentId: '',
    profilePhone: '',
    deadlineText: '',
    shareToken: '',
    inviteCodeInput: '',
  },

  onLoad(options) {
    const taskId = options.taskId || wx.getStorageSync('scheduling-current-task');
    const rawToken = options.shareToken
      ? decodeURIComponent(String(options.shareToken))
      : (wx.getStorageSync('scheduling-share-token') || '');
    const shareToken = String(rawToken || '').trim().toUpperCase();
    if (shareToken) wx.setStorageSync('scheduling-share-token', shareToken);
    this.setData({
      taskId,
      shareToken,
      inviteCodeInput: shareToken,
    });
    this.load(taskId);
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCodeInput: e.detail.value || '' });
  },

  applyInviteCode() {
    const code = String(this.data.inviteCodeInput || '').trim().toUpperCase();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    wx.setStorageSync('scheduling-share-token', code);
    this.setData({ shareToken: code, inviteCodeInput: code });
    wx.showToast({ title: '邀请码已应用', icon: 'success' });
  },

  load(taskId) {
    if (!taskId) return this.setData({ loading: false });
    Promise.all([
      api.request(`/tasks/${taskId}`),
      api.request(`/tasks/${taskId}/availability/me`),
    ])
      .then(([task, current]) => {
        const days = [...new Set((task.slots || []).map((slot) => slot.slotDate))].sort();
        const byPeriod = new Map();
        (task.slots || []).forEach((slot) => {
          const row = byPeriod.get(slot.periodId) || { label: time(slot.startsAt), slots: {} };
          row.slots[slot.slotDate] = slot.id;
          byPeriod.set(slot.periodId, row);
        });
        const rows = [...byPeriod.values()].map((row) => ({
          ...row,
          states: days.map((date) => {
            const slotId = row.slots[date];
            const entry = (current || []).find((item) => item.slotId === slotId);
            return entry?.state || 'unavailable';
          }),
        }));
        const requiredFields = requiredFieldsOf(task);
        const user = currentUser();
        const profileName = this.data.profileName || user?.nickname || user?.displayName || user?.name || '';
        this.setData({
          task,
          days: days.map((date) => ({ date, day: String(date).slice(8), week: weekday(date) })),
          rows,
          submitted: Boolean(current?.length),
          loading: false,
          requiredFields,
          needName: requiredFields.includes('name'),
          needStudentId: requiredFields.includes('studentId'),
          needPhone: requiredFields.includes('phone'),
          profileName,
          deadlineText: formatDeadline(task.deadline),
        });
      })
      .catch(() => this.setData({ loading: false }));
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onProfileInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value });
  },

  cycleState(e) {
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);
    const states = ['unavailable', 'available', 'preferred'];
    const current = this.data.rows[row].states[col];
    this.setData({
      [`rows[${row}].states[${col}]`]: states[(states.indexOf(current) + 1) % states.length],
    });
  },

  buildProfile() {
    const required = this.data.requiredFields || [];
    if (!required.length) return undefined;
    const profile = {};
    if (required.includes('name')) {
      const name = String(this.data.profileName || '').trim();
      if (!name) {
        wx.showToast({ title: '请填写姓名', icon: 'none' });
        return null;
      }
      profile.name = name;
    }
    if (required.includes('studentId')) {
      const studentId = String(this.data.profileStudentId || '').trim();
      if (!studentId) {
        wx.showToast({ title: '请填写学号', icon: 'none' });
        return null;
      }
      profile.studentId = studentId;
    }
    if (required.includes('phone')) {
      const phone = String(this.data.profilePhone || '').trim();
      if (!phone) {
        wx.showToast({ title: '请填写手机号', icon: 'none' });
        return null;
      }
      profile.phone = phone;
    }
    return profile;
  },

  submit() {
    const profile = this.buildProfile();
    if (profile === null) return;

    const entries = [];
    this.data.rows.forEach((row) => {
      this.data.days.forEach((day, index) => {
        const slotId = row.slots[day.date];
        if (slotId) entries.push({ slotId, state: row.states[index] || 'unavailable' });
      });
    });

    const data = { entries };
    if (profile) data.profile = profile;
    const shareToken = String(this.data.shareToken || this.data.inviteCodeInput || '').trim().toUpperCase();
    if (shareToken) data.shareToken = shareToken;

    this.setData({ saving: true });
    api
      .request(`/tasks/${this.data.taskId}/availability`, {
        method: 'POST',
        data,
        header: shareToken ? { 'x-share-token': shareToken } : undefined,
      })
      .then(() => {
        this.setData({ submitted: true, shareToken });
        wx.showToast({ title: '可用时间已提交', icon: 'success' });
      })
      .catch(() => wx.showToast({ title: '提交失败，请检查任务状态', icon: 'none' }))
      .finally(() => this.setData({ saving: false }));
  },

  undo() {
    this.load(this.data.taskId);
  },
});
