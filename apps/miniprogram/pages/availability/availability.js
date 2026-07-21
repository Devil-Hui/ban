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

/** Map a domain error code to a friendly Chinese toast. */
function messageForShareCode(code, fallback) {
  const map = {
    SHARE_TOKEN_USED: '该邀请链接已被使用，无法重复提交',
    SHARE_TOKEN_INVALID: '邀请链接无效或已过期',
    MEMBERSHIP_REQUIRED: '请先加入该分组后再填写',
    RESERVED_NAME_MISMATCH: '姓名与预留名单不一致，无法提交',
    INVALID_REQUIRED_FIELD: '必填项格式不正确，请检查后重试',
  };
  return map[code] || fallback;
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

    // E7: share-based participation & one-time token awareness
    isMember: false,
    accessState: '', // '' | 'open' | 'membershipRequired' | 'tokenMissing' | 'tokenUsed' | 'tokenInvalid' | 'unknown'
    landingContext: null,
    groupName: '',
    groupInviteCode: '',

    // E6: dynamic custom required fields
    customFields: [], // [{ key, label }]
    customValues: {}, // { [key]: string }
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
    this.loadLandingContext();
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCodeInput: e.detail.value || '' });
  },

  /** Apply an invite code, then re-derive landing context so the page re-evaluates access. */
  applyInviteCode() {
    const code = String(this.data.inviteCodeInput || '').trim().toUpperCase();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    wx.setStorageSync('scheduling-share-token', code);
    this.setData({ shareToken: code, inviteCodeInput: code });
    wx.showToast({ title: '邀请码已应用', icon: 'success' });
    this.loadLandingContext();
  },

  /**
   * Read-only landing context (no membership required). Determines whether the
   * current visitor may fill the form and, for external invitees, whether the
   * share token is still usable.
   */
  loadLandingContext() {
    const id = this.data.taskId;
    if (!id) return this.setData({ loading: false, accessState: 'unknown' });
    this.setData({ loading: true });
    const token = this.data.shareToken;
    const qs = token ? `?shareToken=${encodeURIComponent(token)}` : '';
    return api
      .request(`/tasks/${id}/landing-context${qs}`)
      .then((ctx) => {
        const accessState = this.deriveAccessState(ctx);
        this.setData({
          landingContext: ctx,
          isMember: Boolean(ctx && ctx.isMember),
          groupName: (ctx && ctx.groupName) || '',
          groupInviteCode: (ctx && ctx.groupInviteCode) || '',
          accessState,
        });
        if (accessState === 'open') {
          this.load();
        } else {
          this.setData({ loading: false });
        }
      })
      .catch(() => {
        // Landing context itself failed (e.g. task not found): fall back to the
        // direct task fetch (previous behaviour) so members can still load.
        this.setData({
          landingContext: null,
          isMember: false,
          accessState: 'unknown',
        });
        this.load();
      });
  },

  /** Derive the page access state from the landing-context payload. */
  deriveAccessState(ctx) {
    if (!ctx) return 'unknown';
    if (ctx.isMember) return 'open';
    const scope = ctx.participantScope;
    if (scope === 'all_members') return 'membershipRequired';
    // share_link / reserved_list require a valid (unused) token.
    if (!this.data.shareToken) return 'tokenMissing';
    if (ctx.tokenValid) return 'open';
    return ctx.tokenUsed ? 'tokenUsed' : 'tokenInvalid';
  },

  load(taskId) {
    const id = taskId || this.data.taskId;
    if (!id) return this.setData({ loading: false });
    // Blocked visitors (explicit access state) never reach the task fetch.
    const blockedStates = ['membershipRequired', 'tokenMissing', 'tokenUsed', 'tokenInvalid'];
    if (blockedStates.includes(this.data.accessState)) {
      return this.setData({ loading: false });
    }
    const token = this.data.shareToken;
    const qs = token ? `?shareToken=${encodeURIComponent(token)}` : '';
    Promise.all([
      api.request(`/tasks/${id}${qs}`),
      api.request(`/tasks/${id}/availability/me${qs}`),
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
        const labels = (task.rules && task.rules.requiredFieldLabels) || {};
        const customFields = requiredFields
          .filter((field) => field.indexOf('custom_') === 0)
          .map((field) => ({ key: field, label: labels[field] || field.replace(/^custom_/, '') }));
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
          customFields,
          customValues: {},
          profileName,
          deadlineText: formatDeadline(task.deadline),
        });
      })
      .catch((err) => {
        // Token may have been consumed between landing-context and the task fetch
        // (race / forwarded link). Reflect the consumed state instead of failing silently.
        const code = err?.data?.error?.code || err?.code;
        if (!this.data.isMember && (code === 'MEMBERSHIP_REQUIRED' || code === 'SHARE_TOKEN_INVALID' || code === 'SHARE_TOKEN_USED' || code === 'NOT_FOUND')) {
          const nextState = this.data.shareToken ? 'tokenUsed' : 'membershipRequired';
          this.setData({ accessState: nextState, loading: false });
          return;
        }
        this.setData({ loading: false });
      });
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onProfileInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value });
  },

  onCustomInput(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ [`customValues.${key}`]: e.detail.value });
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
    // E6: custom required fields are validated and included verbatim.
    const customValues = this.data.customValues || {};
    for (const field of required) {
      if (field.indexOf('custom_') !== 0) continue;
      const value = String(customValues[field] || '').trim();
      const meta = (this.data.customFields || []).find((item) => item.key === field);
      const label = (meta && meta.label) || '该项';
      if (!value) {
        wx.showToast({ title: `请填写${label}`, icon: 'none' });
        return null;
      }
      profile[field] = value;
    }
    return profile;
  },

  submit() {
    if (this.data.saving) return;
    // E3: a one-time share token is consumed on first submit; block resubmission
    // once the external invitee has already submitted.
    if (this.data.submitted && !this.data.isMember && !this.data.shareToken) {
      wx.showToast({ title: '已提交，邀请链接不可重复提交', icon: 'none' });
      return;
    }

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
        // Consume the token locally so a forwarded/ reused link cannot resubmit.
        if (shareToken && !this.data.isMember) {
          wx.removeStorageSync('scheduling-share-token');
          this.setData({ shareToken: '', inviteCodeInput: '' });
        }
        this.setData({ submitted: true });
        wx.showToast({ title: '可用时间已提交', icon: 'success' });
      })
      .catch((err) => {
        const code = err?.data?.error?.code || err?.code;
        const fallback = api.errorMessage(err, '提交失败，请检查任务状态');
        wx.showToast({ title: messageForShareCode(code, fallback), icon: 'none' });
      })
      .finally(() => this.setData({ saving: false }));
  },

  undo() {
    this.load(this.data.taskId);
  },
});
