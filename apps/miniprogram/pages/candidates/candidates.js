const api = require('../../utils/api');
const {
  buildAssignmentRows,
  replaceAssignmentMember,
  buildPlanGrid,
} = require('../../utils/candidate-assignment');
const { formatSlotLabel } = require('../../utils/time-format');

Page({
  data: {
    taskId: '',
    jobId: '',
    status: 'queued',
    progress: 0,
    candidates: [],
    members: [],
    slots: [],
    task: null,
    selected: 0,
    selectedRows: [],
    publishing: false,
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
      jobId: options.jobId,
      myUserId: me.id || '',
    });
    this.poll();
  },

  onUnload() {
    if (this.timer) clearTimeout(this.timer);
  },

  poll() {
    api
      .request(`/tasks/${this.data.taskId}/solve/${this.data.jobId}`)
      .then((job) => {
        this.setData({ status: job.status, progress: job.progress });
        if (job.status === 'completed') {
          return Promise.all([
            api.request(`/tasks/${this.data.taskId}/solve/${this.data.jobId}/candidates`),
            api.request(`/tasks/${this.data.taskId}`),
          ]).then(([items, task]) =>
            api.request(`/groups/${task.groupId}/members`).then((members) => {
              const active = members.filter((member) => member.status === 'active');
              const candidates = items.map((candidate) => ({
                ...candidate,
                assignmentRows: buildAssignmentRows(candidate.assignments, task.slots).map((row) => ({
                  ...row,
                  displayName:
                    active.find((member) => member.userId === row.userId)?.displayName || '未知成员',
                })),
              }));
              this.setData({
                candidates,
                members: active,
                slots: task.slots || [],
                task,
                selectedRows: candidates[0]?.assignmentRows || [],
              });
              this.refreshPlanGrid(0, candidates, task);
            }),
          );
        }
        if (job.status !== 'failed') this.timer = setTimeout(() => this.poll(), 1200);
      })
      .catch(() => {
        this.timer = setTimeout(() => this.poll(), 2000);
      });
  },

  refreshPlanGrid(selected, candidates, task) {
    const list = candidates || this.data.candidates;
    const t = task || this.data.task;
    const candidate = list[selected];
    if (!candidate || !t) {
      this.setData({
        planPeriods: [],
        planDates: [],
        planSelectedKeys: [],
        planPeopleByKey: {},
      });
      return;
    }
    const grid = buildPlanGrid({
      assignmentsMap: candidate.assignments,
      slots: t.slots || [],
      highlightUserId: this.data.myUserId,
      dateStart: t.dateStart,
      dateEnd: t.dateEnd,
    });
    // Show full plan selected keys, people = counts; mine still in selectedKeys if highlight
    // Prefer full plan greens, with people counts
    const full = buildPlanGrid({
      assignmentsMap: candidate.assignments,
      slots: t.slots || [],
      dateStart: t.dateStart,
      dateEnd: t.dateEnd,
    });
    // Merge: all assigned cells selected; peopleByKey marks counts; mine highlighted via higher paint
    const peopleByKey = { ...full.peopleByKey };
    (grid.highlightKeys || []).forEach((key) => {
      peopleByKey[key] = peopleByKey[key] || 1;
    });
    this.setData({
      planPeriods: full.periods,
      planDates: full.dates,
      planSelectedKeys: full.selectedKeys,
      planPeopleByKey: peopleByKey,
      planHighlightKeys: grid.highlightKeys || [],
    });
  },

  select(e) {
    const selected = Number(e.currentTarget.dataset.index);
    this.setData({
      selected,
      selectedRows: this.data.candidates[selected]?.assignmentRows || [],
    });
    this.refreshPlanGrid(selected);
  },

  adjust(e) {
    const row = this.data.selectedRows[Number(e.currentTarget.dataset.row)];
    const member = this.data.members[Number(e.detail.value)];
    const candidate = this.data.candidates[this.data.selected];
    if (!row || !member || !candidate) return;
    try {
      const changed = replaceAssignmentMember(candidate, row, member.userId);
      changed.assignmentRows = buildAssignmentRows(changed.assignments, this.data.slots).map((item) => ({
        ...item,
        displayName:
          this.data.members.find((value) => value.userId === item.userId)?.displayName || '未知成员',
      }));
      const candidates = this.data.candidates.slice();
      candidates[this.data.selected] = changed;
      this.setData({ candidates, selectedRows: changed.assignmentRows });
      this.refreshPlanGrid(this.data.selected, candidates);
    } catch (error) {
      wx.showToast({
        title: /duplicate/i.test(error.message) ? '同一班次不能重复安排' : '成员替换失败',
        icon: 'none',
      });
    }
  },

  publish() {
    const candidate = this.data.candidates[this.data.selected];
    if (!candidate) return;
    const assignments = [];
    Object.keys(candidate.assignments || {}).forEach((slotId) =>
      (candidate.assignments[slotId] || []).forEach((userId) => assignments.push({ slotId, userId })),
    );
    this.setData({ publishing: true });
    api
      .request(`/tasks/${this.data.taskId}/publish`, { method: 'POST', data: { assignments } })
      .then(() => wx.redirectTo({ url: `/pages/result/result?taskId=${this.data.taskId}&manage=1` }))
      .catch(() => wx.showToast({ title: '发布失败，请检查人数约束', icon: 'none' }))
      .finally(() => this.setData({ publishing: false }));
  },
});
