const api = require('../../utils/api');
const { loadCatalog, statusLabel } = require('../../utils/catalog-labels');
const { formatYmd, formatDeadline } = require('../../utils/time-format');

Page({
  data: {
    groupId: '',
    name: '',
    role: '成员',
    canManage: false,
    isOwner: false,
    inviteCode: '',
    tasks: [],
    members: [],
    loading: true,
  },

  onLoad(options) {
    const role = decodeURIComponent(options.role || '成员');
    this.setData({
      groupId: options.id,
      name: decodeURIComponent(options.name || ''),
      role,
      canManage: role === '发布者' || role === '管理员',
      isOwner: role === '发布者',
    });
    this.load();
  },

  onShow() {
    if (this.data.groupId) this.load();
  },

  load() {
    Promise.all([
      api.request(`/groups/${this.data.groupId}/tasks`),
      api.request(`/groups/${this.data.groupId}/members`),
      api.request(`/groups/${this.data.groupId}`),
      loadCatalog(),
    ])
      .then(([tasks, members, detail, catalog]) =>
        this.setData({
          tasks: (tasks || []).map((task) => ({
            ...task,
            statusLabel: statusLabel(task.status, catalog),
            dateRangeText: `${formatYmd(task.dateStart)} 至 ${formatYmd(task.dateEnd)}`,
            deadlineText: formatDeadline(task.deadline),
          })),
          inviteCode: detail?.group?.inviteCode || '',
          members: members.filter(
            (item) => item.status === 'active' || (this.data.canManage && item.blacklisted),
          ),
          name: detail?.group?.name || this.data.name,
          loading: false,
        }),
      )
      .catch(() => this.setData({ loading: false }));
  },

  createTask() {
    wx.navigateTo({ url: `/pages/task-create/task-create?groupId=${this.data.groupId}` });
  },

  openTask(e) {
    const task = this.data.tasks[e.currentTarget.dataset.index];
    wx.navigateTo({
      url: `/pages/task-detail/task-detail?id=${task.id}&manage=${this.data.canManage ? 1 : 0}`,
    });
  },

  manageMember(e) {
    const member = this.data.members[e.currentTarget.dataset.index];
    if (!member || member.role === 'owner') return;
    if (member.blacklisted) {
      return wx.showModal({
        title: '解除黑名单',
        content: `允许 ${member.displayName} 再次使用邀请码加入？`,
        success: (choice) => {
          if (choice.confirm) {
            api
              .request(`/groups/${this.data.groupId}/members/${member.userId}/unblock`, {
                method: 'POST',
              })
              .then(() => this.load());
          }
        },
      });
    }
    const actions = [];
    if (this.data.isOwner && member.role !== 'admin') actions.push('设为管理员');
    if (this.data.isOwner && member.role === 'admin') actions.push('取消管理员');
    actions.push('移出分组');
    actions.push('移出并加入黑名单');
    wx.showActionSheet({
      itemList: actions,
      success: (result) => {
        const action = actions[result.tapIndex];
        if (action === '移出分组' || action === '移出并加入黑名单') {
          return wx.showModal({
            title: '移出成员',
            editable: true,
            placeholderText: '填写原因（可选）',
            success: (choice) => {
              if (choice.confirm) {
                api
                  .request(`/groups/${this.data.groupId}/members/${member.userId}/kick`, {
                    method: 'POST',
                    data: {
                      reason: choice.content || '管理员操作',
                      blacklist: action.includes('黑名单'),
                    },
                  })
                  .then(() => this.load());
              }
            },
          });
        }
        const method = action === '取消管理员' ? 'DELETE' : 'PATCH';
        return api
          .request(`/groups/${this.data.groupId}/members/${member.userId}/admin`, { method })
          .then(() => this.load());
      },
    });
  },

  copyInvite() {
    if (!this.data.inviteCode) return;
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
    });
  },

  leave() {
    if (this.data.isOwner) return wx.showToast({ title: '请先转移组主身份', icon: 'none' });
    wx.showModal({
      title: '退出分组',
      content: '退出后仍可凭有效邀请码重新加入。',
      success: (choice) => {
        if (choice.confirm) {
          api
            .request(`/groups/${this.data.groupId}/leave`, { method: 'POST' })
            .then(() => wx.switchTab({ url: '/pages/groups/groups' }));
        }
      },
    });
  },

  transfer() {
    if (!this.data.isOwner) return;
    const members = this.data.members.filter(
      (item) => item.status === 'active' && item.role !== 'owner',
    );
    if (!members.length) return wx.showToast({ title: '暂无可转移的成员', icon: 'none' });
    wx.showActionSheet({
      itemList: members.map((item) => item.displayName),
      success: (result) => {
        const member = members[result.tapIndex];
        wx.showModal({
          title: '转移组主身份',
          content: `确认将组主转给 ${member.displayName}？`,
          success: (choice) => {
            if (choice.confirm) {
              api
                .request(`/groups/${this.data.groupId}/transfer-ownership`, {
                  method: 'POST',
                  data: { targetUserId: member.userId },
                })
                .then(() => wx.navigateBack());
            }
          },
        });
      },
    });
  },

  dissolve() {
    if (!this.data.isOwner) return;
    wx.showModal({
      title: '解散分组',
      content: '分组会停止新的排班协作，历史记录保留但不可继续使用。',
      confirmColor: '#df5c4c',
      success: (choice) => {
        if (choice.confirm) {
          api
            .request(`/groups/${this.data.groupId}`, { method: 'DELETE' })
            .then(() => wx.switchTab({ url: '/pages/groups/groups' }));
        }
      },
    });
  },

  onShareAppMessage() {
    return {
      title: `${this.data.name} · 加入排班分组`,
      path: `/pages/groups/groups?inviteCode=${this.data.inviteCode}`,
    };
  },
});
