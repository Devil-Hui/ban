const api = require('../../utils/api');

Page({
  data: { groups: [], actions: [{ icon: 'add', label: '创建分组', action: 'create' }, { icon: 'share', label: '加入分组', action: 'join' }, { icon: 'calendar', label: '我的日程', page: '/pages/schedule/schedule' }], loading: true, user: {} },
  onShow() {
    api.login()
      .then((user) => {
        this.setData({ user });
        return api.request('/groups');
      })
      .then((groups) => this.setData({
        groups: (groups || []).map((group) => ({
          ...group,
          role: group.role === 'owner' ? '发布者' : group.role === 'admin' ? '管理员' : '成员',
          tone: group.role === 'owner' ? 'green' : 'blue',
        })),
        loading: false,
      }))
      .catch(() => this.setData({ loading: false }));
  },
  onActionTap(e) { const action = e.currentTarget.dataset.action; if (action) wx.setStorageSync('scheduling-group-action', action); wx.switchTab({ url: e.currentTarget.dataset.page || '/pages/groups/groups' }); },
  onGroupTap(e) { const group = this.data.groups[e.currentTarget.dataset.index]; wx.navigateTo({ url: `/pages/group-detail/group-detail?id=${group.id}&name=${encodeURIComponent(group.name)}&role=${encodeURIComponent(group.role)}` }); },
});
