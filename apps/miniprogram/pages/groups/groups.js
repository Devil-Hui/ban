const api = require('../../utils/api');
const { uniqueGroupName } = require('../../domain/group-name');
const { loadCatalog, roleLabel } = require('../../utils/catalog-labels');

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'publisher', label: '发布者' },
  { key: 'member', label: '成员' },
];

function decorateGroup(group, catalog) {
  const role = group.role || '';
  const isPublisher = role === 'owner' || role === 'admin';
  return {
    ...group,
    desc: group.description || group.desc || '',
    roleLabel: roleLabel(role, catalog),
    tone: isPublisher ? 'green' : 'blue',
    filterKey: isPublisher ? 'publisher' : 'member',
  };
}

function applyFilter(groups, filter) {
  const list = groups || [];
  if (filter === 'publisher') return list.filter((g) => g.filterKey === 'publisher');
  if (filter === 'member') return list.filter((g) => g.filterKey === 'member');
  return list;
}

Page({
  data: {
    showJoin: false,
    code: '',
    groups: [],
    filteredGroups: [],
    filters: FILTERS,
    roleFilter: 'all',
    loading: true,
    joining: false,
    user: {},
    groupDefaultDescription: '',
  },

  onLoad(options) {
    if (options.inviteCode) {
      this.setData({ code: String(options.inviteCode).toUpperCase(), showJoin: true });
    }
  },

  onShow() {
    const action = wx.getStorageSync('scheduling-group-action');
    wx.removeStorageSync('scheduling-group-action');
    this.load().then(() => {
      if (action === 'create') this.onCreate();
      if (action === 'join') this.onJoin();
    });
  },

  load() {
    return Promise.all([api.login(), loadCatalog()])
      .then(([user, catalog]) => {
        this.setData({
          user,
          groupDefaultDescription: catalog.groupDefaultDescription || '',
        });
        return api.request('/groups').then((groups) => {
          const decorated = (groups || []).map((g) => decorateGroup(g, catalog));
          this.setData({
            groups: decorated,
            filteredGroups: applyFilter(decorated, this.data.roleFilter),
            loading: false,
          });
        });
      })
      .catch(() => this.setData({ loading: false }));
  },

  setRoleFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.roleFilter) return;
    this.setData({
      roleFilter: key,
      filteredGroups: applyFilter(this.data.groups, key),
    });
  },

  onCreate() {
    wx.showModal({
      title: '创建分组',
      editable: true,
      placeholderText: '输入分组名称',
      success: (result) => {
        const rawName = (result.content || '').trim();
        if (!result.confirm || !rawName) return;
        const name = uniqueGroupName(
          rawName,
          (this.data.groups || []).map((group) => group.name),
        );
        const payload = {
          name,
          ownerDisplayName: this.data.user?.nickname || name,
        };
        if (this.data.groupDefaultDescription) {
          payload.description = this.data.groupDefaultDescription;
        }
        api
          .request('/groups', { method: 'POST', data: payload })
          .then((created) => {
            const finalName = (created && created.name) || name;
            wx.showToast({ title: finalName ? `已创建 ${finalName}` : '分组已创建', icon: 'success' });
            this.load();
          })
          .catch(() => wx.showToast({ title: '创建失败', icon: 'none' }));
      },
    });
  },

  onJoin() {
    this.setData({ showJoin: true, code: '' });
  },

  onCode(e) {
    this.setData({ code: String(e.detail.value || '').toUpperCase() });
  },

  closeJoin() {
    this.setData({ showJoin: false });
  },

  confirmJoin() {
    if (this.data.code.length !== 6) {
      return wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' });
    }
    this.setData({ joining: true });
    api
      .request('/groups/join', {
        method: 'POST',
        data: {
          inviteCode: this.data.code,
          displayName: this.data.user?.nickname || '新成员',
        },
      })
      .then(() => {
        this.setData({ showJoin: false });
        wx.showToast({ title: '加入成功', icon: 'success' });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: error?.data?.message || error?.data?.error?.message || '邀请码无效',
          icon: 'none',
        }),
      )
      .finally(() => this.setData({ joining: false }));
  },

  noop() {},

  onGroup(e) {
    const group = this.data.filteredGroups[e.currentTarget.dataset.index];
    if (!group) return;
    wx.navigateTo({
      url: `/pages/group-detail/group-detail?id=${group.id}&name=${encodeURIComponent(group.name)}&role=${encodeURIComponent(group.roleLabel)}`,
    });
  },
});
