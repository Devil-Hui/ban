const api = require('../../utils/api');
const { loadCatalog, statusLabel } = require('../../utils/catalog-labels');
const { formatYmd, formatDeadline, formatHm, enumerateDates, pad2 } = require('../../utils/time-format');

function decorateTask(task, catalog) {
  const status = task.status || '';
  return {
    ...task,
    statusLabel: statusLabel(status, catalog),
    dateRangeText: `${formatYmd(task.dateStart)} 至 ${formatYmd(task.dateEnd)}`,
    deadlineText: formatDeadline(task.deadline),
    canClose: status === 'collecting',
    canSolve: ['collecting', 'ready', 'reviewing', 'failed'].includes(status),
    canReopen: ['ready', 'reviewing', 'failed'].includes(status),
    canViewResult: ['published', 'adjusting'].includes(status),
    canMintShare: status === 'collecting',
    canStaff: ['ready', 'reviewing', 'failed', 'solving'].includes(status),
  };
}

/**
 * Build course-table model:
 * - columns = full dateStart..dateEnd (not only dates that have slots)
 * - green selectedKeys = actual task_slots
 * - peopleByKey = maxPeople or fixed count after staffing
 */
function buildSlotGrid(task, fixedAssignments = []) {
  const slots = task?.slots || [];
  const dates = enumerateDates(task?.dateStart, task?.dateEnd);
  const periodMap = new Map();
  const selectedKeys = [];
  const peopleByKey = {};
  const slotIdByKey = {};
  const keyBySlotId = {};
  const fixedCountBySlot = {};

  (fixedAssignments || []).forEach((item) => {
    fixedCountBySlot[item.slotId] = (fixedCountBySlot[item.slotId] || 0) + 1;
  });

  const periodOrder = [];
  const seenPeriod = new Set();

  slots.forEach((slot) => {
    const date = formatYmd(slot.slotDate || slot.date);
    if (!date) return;
    const code = String(slot.periodCode || slot.periodId || slot.id);
    if (!seenPeriod.has(code)) {
      seenPeriod.add(code);
      periodOrder.push(code);
      const start = formatHm(slot.startsAt);
      const end = formatHm(slot.endsAt);
      periodMap.set(code, {
        code,
        label: start && end ? `${start}-${end}` : start || code,
        startMinute: 0,
        endMinute: 0,
      });
    }
    const key = `${date}|${code}`;
    selectedKeys.push(key);
    slotIdByKey[key] = slot.id;
    keyBySlotId[slot.id] = key;
    const fixedCount = fixedCountBySlot[slot.id] || 0;
    peopleByKey[key] = fixedCount > 0 ? fixedCount : (slot.maxPeople != null ? slot.maxPeople : 1);
  });

  return {
    periods: periodOrder.map((code) => periodMap.get(code)).filter(Boolean),
    dates,
    selectedKeys,
    peopleByKey,
    slotIdByKey,
    keyBySlotId,
  };
}

function inviteShareText(task, inviteCode) {
  const title = task?.title || '排班任务';
  const deadline = task?.deadlineText || '';
  return [
    '【智能排班】邀请你填写可用时间',
    `任务：${title}`,
    deadline ? `截止：${deadline}` : '',
    `邀请码：${inviteCode}`,
    '打开小程序后输入邀请码填写可用时间',
  ]
    .filter(Boolean)
    .join('\n');
}

Page({
  data: {
    taskId: '',
    manage: false,
    task: null,
    slots: [],
    gridMode: 'readonly',
    gridPeriods: [],
    gridDates: [],
    gridSelectedKeys: [],
    gridPeopleByKey: {},
    slotIdByKey: {},
    members: [],
    fixedAssignments: [],
    availabilityBySlot: {},
    objections: [],
    collection: null,
    availabilitySubmitted: false,
    loading: true,
    solving: false,
    mintingShare: false,
    inviteCode: '',
    inviteExpiresText: '',
    inviteShareText: '',
    // staffing sheet
    sheetOpen: false,
    sheetTitle: '',
    sheetSlotId: '',
    sheetMax: 1,
    sheetCandidates: [],
    sheetSelectedMap: {},
    sheetSelectedCount: 0,
    sheetSaving: false,
  },

  onLoad(options) {
    this.setData({ taskId: options.id, manage: options.manage === '1' });
    this.load();
  },

  onShow() {
    if (this.data.taskId) this.load();
  },

  onReady() {
    // Ensure the "..." share menu entry is enabled so managers can forward the invite.
    if (typeof wx.showShareMenu === 'function') {
      wx.showShareMenu({ menus: ['shareAppMessage'] });
    }
  },

  onShareAppMessage() {
    const taskId = this.data.taskId;
    const code = this.data.inviteCode;
    const title = this.data.task?.title
      ? `填写可用时间：${this.data.task.title}`
      : '邀请你填写可用时间';
    if (code) {
      return {
        title,
        path: `/pages/availability/availability?taskId=${taskId}&shareToken=${encodeURIComponent(code)}`,
      };
    }
    return {
      title: '智能排班',
      path: `/pages/task-detail/task-detail?id=${taskId}&manage=0`,
    };
  },

  load() {
    this.setData({ loading: true });
    Promise.all([api.request(`/tasks/${this.data.taskId}`), loadCatalog()])
      .then(([task, catalog]) => {
      const manage = this.data.manage;
      const needBoard = manage && ['ready', 'reviewing', 'failed', 'solving', 'published', 'adjusting'].includes(task.status);
      const requests = [
        Promise.resolve(task),
        Promise.resolve(catalog),
        api.request(`/groups/${task.groupId}/members`),
        api.request(`/tasks/${task.id}/fixed-assignments`),
        manage
          ? api.request(`/tasks/${task.id}/collection`)
          : api.request(`/tasks/${task.id}/availability/me`),
        needBoard
          ? api.request(`/tasks/${task.id}/availability-board`).catch(() => ({ bySlot: {} }))
          : Promise.resolve({ bySlot: {} }),
      ];
      if (manage && task.status === 'published') {
        requests.push(
          api
            .request(`/tasks/${task.id}/schedule`)
            .then((schedule) => api.request(`/tasks/${task.id}/versions/${schedule.versionId}/objections`))
            .catch(() => []),
        );
      }
      return Promise.all(requests);
    }).then(([task, catalog, members, fixedAssignments, collectionOrAvailability, board, objections = []]) => {
      const decorated = decorateTask(task, catalog);
      const grid = buildSlotGrid(task, fixedAssignments);
      const gridMode = this.data.manage && decorated.canStaff ? 'staff' : 'readonly';
      const patch = {
        task: decorated,
        slots: task.slots || [],
        gridMode,
        gridPeriods: grid.periods,
        gridDates: grid.dates,
        gridSelectedKeys: grid.selectedKeys,
        gridPeopleByKey: grid.peopleByKey,
        slotIdByKey: grid.slotIdByKey,
        members: (members || []).filter((item) => item.status === 'active'),
        fixedAssignments: fixedAssignments || [],
        availabilityBySlot: board?.bySlot || {},
        collection: this.data.manage ? collectionOrAvailability : null,
        availabilitySubmitted: this.data.manage ? false : Boolean(collectionOrAvailability?.length),
        objections: objections || [],
        loading: false,
      };
      if (this.data.inviteCode) {
        patch.inviteShareText = inviteShareText(decorated, this.data.inviteCode);
      }
      this.setData(patch);
    }).catch(() => this.setData({ loading: false }));
  },

  fill() {
    wx.setStorageSync('scheduling-current-task', this.data.taskId);
    wx.navigateTo({ url: `/pages/availability/availability?taskId=${this.data.taskId}` });
  },

  onGridCellTap(e) {
    if (!this.data.manage || !this.data.task?.canStaff) return;
    const key = e.detail?.key;
    if (!key) return;
    const slotId = this.data.slotIdByKey[key];
    if (!slotId) {
      wx.showToast({ title: '该日未开放排班', icon: 'none' });
      return;
    }
    const slot = (this.data.slots || []).find((item) => item.id === slotId);
    const max = slot?.maxPeople != null ? Number(slot.maxPeople) : 1;
    const candidates = (this.data.availabilityBySlot[slotId] || []).map((item) => ({
      ...item,
      checked: false,
    }));
    const fixedForSlot = (this.data.fixedAssignments || []).filter((item) => item.slotId === slotId);
    const selectedMap = {};
    fixedForSlot.forEach((item) => {
      selectedMap[item.userId] = true;
    });
    const sheetCandidates = candidates.map((item) => ({
      ...item,
      checked: !!selectedMap[item.userId],
    }));
    // include already fixed members even if not in board (edge)
    fixedForSlot.forEach((item) => {
      if (!sheetCandidates.some((c) => c.userId === item.userId)) {
        const member = this.data.members.find((m) => m.userId === item.userId);
        sheetCandidates.push({
          userId: item.userId,
          displayName: member?.displayName || item.userId,
          state: 'fixed',
          checked: true,
        });
        selectedMap[item.userId] = true;
      }
    });
    const datePart = key.split('|')[0];
    const timeLabel = formatHm(slot?.startsAt);
    this.setData({
      sheetOpen: true,
      sheetTitle: `${datePart}${timeLabel ? ` ${timeLabel}` : ''} · 最多 ${max} 人`,
      sheetSlotId: slotId,
      sheetMax: max,
      sheetCandidates,
      sheetSelectedMap: selectedMap,
      sheetSelectedCount: Object.keys(selectedMap).filter((id) => selectedMap[id]).length,
    });
  },

  closeSheet() {
    this.setData({ sheetOpen: false, sheetSaving: false });
  },

  noop() {},

  toggleSheetMember(e) {
    const userId = e.currentTarget.dataset.userid;
    if (!userId) return;
    const selectedMap = { ...(this.data.sheetSelectedMap || {}) };
    if (selectedMap[userId]) {
      delete selectedMap[userId];
    } else {
      const count = Object.keys(selectedMap).length;
      if (count >= this.data.sheetMax) {
        wx.showToast({ title: `最多选 ${this.data.sheetMax} 人`, icon: 'none' });
        return;
      }
      selectedMap[userId] = true;
    }
    const sheetCandidates = (this.data.sheetCandidates || []).map((item) => ({
      ...item,
      checked: !!selectedMap[item.userId],
    }));
    this.setData({
      sheetSelectedMap: selectedMap,
      sheetCandidates,
      sheetSelectedCount: Object.keys(selectedMap).length,
    });
  },

  saveSheet() {
    const slotId = this.data.sheetSlotId;
    if (!slotId || this.data.sheetSaving) return;
    const selectedIds = Object.keys(this.data.sheetSelectedMap || {}).filter((id) => this.data.sheetSelectedMap[id]);
    if (selectedIds.length > this.data.sheetMax) {
      wx.showToast({ title: `最多 ${this.data.sheetMax} 人`, icon: 'none' });
      return;
    }
    const next = (this.data.fixedAssignments || [])
      .filter((item) => item.slotId !== slotId)
      .concat(selectedIds.map((userId) => ({ slotId, userId })));
    this.setData({ sheetSaving: true });
    api
      .request(`/tasks/${this.data.taskId}/fixed-assignments`, {
        method: 'PATCH',
        data: { assignments: next },
      })
      .then((items) => {
        const grid = buildSlotGrid(this.data.task, items);
        this.setData({
          fixedAssignments: items,
          gridPeopleByKey: grid.peopleByKey,
          sheetOpen: false,
          sheetSaving: false,
        });
        wx.showToast({ title: '已保存人选', icon: 'success' });
      })
      .catch(() => {
        this.setData({ sheetSaving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
  },

  mintInvite() {
    if (!this.data.manage || !this.data.task?.canMintShare || this.data.mintingShare) return;
    this.setData({ mintingShare: true });
    api
      .request(`/tasks/${this.data.taskId}/collection-shares`, {
        method: 'POST',
        data: { expiresInHours: 72 },
      })
      .then((share) => {
        const inviteCode = share?.inviteCode || share?.token || '';
        this.setData({
          inviteCode,
          inviteExpiresText: formatDeadline(share?.expiresAt),
          inviteShareText: inviteShareText(this.data.task, inviteCode),
        });
        wx.setClipboardData({
          data: inviteCode,
          success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
          fail: () => wx.showToast({ title: '已生成邀请码', icon: 'success' }),
        });
      })
      .catch(() => wx.showToast({ title: '生成邀请失败', icon: 'none' }))
      .finally(() => this.setData({ mintingShare: false }));
  },

  copyInviteCode() {
    if (!this.data.inviteCode) return wx.showToast({ title: '请先生成邀请', icon: 'none' });
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
    });
  },

  copyInviteShareText() {
    const text = this.data.inviteShareText || this.data.inviteCode;
    if (!text) return wx.showToast({ title: '请先生成邀请', icon: 'none' });
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '邀请文案已复制', icon: 'success' }),
    });
  },

  confirmAction(options, onConfirm) {
    if (wx.getStorageSync('scheduling-auto-confirm')) {
      onConfirm();
      return;
    }
    wx.showModal({
      ...options,
      success: (result) => {
        if (result.confirm) onConfirm();
      },
    });
  },

  closeCollection() {
    this.confirmAction(
      { title: '结束收集', content: '结束后成员不能再提交，可在课表上点格选人。确认？' },
      () => {
        api.request(`/tasks/${this.data.taskId}/close-collection`, { method: 'POST' })
          .then(() => {
            wx.showToast({ title: '已结束收集', icon: 'success' });
            this.load();
          })
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
      },
    );
  },

  reopen() {
    api.request(`/tasks/${this.data.taskId}/reopen`, { method: 'POST' })
      .then(() => {
        wx.showToast({ title: '已重新开放', icon: 'success' });
        this.load();
      })
      .catch(() => wx.showToast({ title: '当前状态无法开放', icon: 'none' }));
  },

  extend() {
    const base = this.data.task?.deadline ? new Date(this.data.task.deadline) : new Date();
    if (Number.isNaN(base.getTime())) {
      wx.showToast({ title: '截止时间无效', icon: 'none' });
      return;
    }
    const local = new Date(base.getTime() + 8 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
    const deadline = `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}T23:59:00.000+08:00`;
    this.confirmAction(
      { title: '延长截止', content: `延长至 ${formatDeadline(deadline)}？` },
      () => {
        api.request(`/tasks/${this.data.taskId}/extend-deadline`, {
          method: 'POST',
          data: { deadline },
        })
          .then(() => {
            wx.showToast({ title: '已更新截止', icon: 'success' });
            this.load();
          })
          .catch(() => wx.showToast({ title: '延长失败', icon: 'none' }));
      },
    );
  },

  solve() {
    this.setData({ solving: true });
    api.request(`/tasks/${this.data.taskId}/solve`, {
      method: 'POST',
      header: { 'Idempotency-Key': `mini-${this.data.taskId}-${Date.now()}` },
    })
      .then((job) => wx.navigateTo({ url: `/pages/candidates/candidates?taskId=${this.data.taskId}&jobId=${job.id}` }))
      .catch(() => wx.showToast({ title: '暂时无法生成方案', icon: 'none' }))
      .finally(() => this.setData({ solving: false }));
  },

  result() {
    wx.navigateTo({ url: `/pages/result/result?taskId=${this.data.taskId}&manage=${this.data.manage ? 1 : 0}` });
  },

  resolveObjection(e) {
    const objection = this.data.objections[e.currentTarget.dataset.index];
    const status = e.currentTarget.dataset.status;
    wx.showModal({
      title: status === 'accepted' ? '接受异议' : '拒绝异议',
      editable: true,
      placeholderText: '填写处理说明',
      success: (result) => {
        const note = (result.content || '').trim();
        if (!result.confirm || !note) return;
        api.request(`/tasks/${this.data.taskId}/versions/${objection.versionId}/objections/${objection.id}`, {
          method: 'PATCH',
          data: { status, note },
        })
          .then(() => {
            wx.showToast({ title: '已处理', icon: 'success' });
            this.load();
          })
          .catch(() => wx.showToast({ title: '处理失败', icon: 'none' }));
      },
    });
  },
});
