const api = require('../../utils/api');
const { writeOverride, clearAppLocalState } = require('../../utils/env-settings');
const { LOCAL_API_BASE_URL } = require('../../utils/runtime-config');

Page({
  data: {
    privacyPhone: '未授权',
    user: {},
    isDevelop: false,
    authMode: 'production',
    envVersion: '',
    apiBaseUrl: '',
    // hidden developer sheet (long-press version)
    devSheetOpen: false,
    authModeLabel: '',
  },

  _versionTapCount: 0,
  _versionTapTimer: null,

  onShow() {
    this.refreshEnv();
    api
      .login()
      .then((user) => {
        this.setData({ user: user || {} });
        return api.request('/users/me/phone');
      })
      .then((result) => this.setData({ privacyPhone: result.phone || '未授权' }))
      .catch(() => {
        const cached = wx.getStorageSync('scheduling-user');
        if (cached) this.setData({ user: cached });
      });
  },

  refreshEnv() {
    const app = getApp();
    if (typeof app.applyRuntimeConfig === 'function') app.applyRuntimeConfig();
    const { authMode, envVersion, apiBaseUrl, isDevelop } = app.globalData;
    this.setData({
      isDevelop: Boolean(isDevelop),
      authMode,
      envVersion: envVersion || '',
      apiBaseUrl: apiBaseUrl || '',
      authModeLabel: authMode === 'mock' ? '本地调试' : '微信授权',
    });
  },

  authorizePhone() {
    wx.showModal({
      title: '授权手机号',
      editable: true,
      placeholderText: '请输入手机号',
      success: (result) => {
        if (!result.confirm || !result.content) return;
        api
          .request('/users/me/phone', { method: 'POST', data: { phone: result.content } })
          .then((data) => this.setData({ privacyPhone: data.phone }))
          .catch(() => wx.showToast({ title: '手机号格式不正确', icon: 'none' }));
      },
    });
  },

  requestDeletion() {
    wx.showModal({
      title: '申请注销账号',
      content: '提交后进入 30 天冷静期，期间可以取消。',
      confirmColor: '#df5c4c',
      success: (result) => {
        if (!result.confirm) return;
        api
          .request('/users/me/deletion', { method: 'POST' })
          .then(() => wx.showToast({ title: '已进入冷静期', icon: 'success' }));
      },
    });
  },

  /** User-facing: no dev copy. Long-press opens hidden panel only in develop. */
  onVersionLongPress() {
    if (!this.data.isDevelop) return;
    this.refreshEnv();
    this.setData({ devSheetOpen: true });
  },

  closeDevSheet() {
    this.setData({ devSheetOpen: false });
  },

  noop() {},

  switchAuthMode() {
    if (!this.data.isDevelop) return;
    const next = this.data.authMode === 'mock' ? 'production' : 'mock';
    writeOverride({ authMode: next });
    const app = getApp();
    if (typeof app.applyRuntimeConfig === 'function') app.applyRuntimeConfig();
    this.refreshEnv();
    this.setData({ devSheetOpen: false });
    wx.showModal({
      title: '登录方式已更新',
      content: '将退出当前会话，请重新点击「微信登录」。',
      showCancel: false,
      success: () => {
        api.logout().then(() => wx.reLaunch({ url: '/pages/login/login' }));
      },
    });
  },

  resetLocal() {
    if (!this.data.isDevelop) return;
    wx.showModal({
      title: '恢复初始化',
      content: '清除本机登录态与环境覆盖。',
      confirmColor: '#df5c4c',
      success: (result) => {
        if (!result.confirm) return;
        clearAppLocalState();
        const app = getApp();
        app.globalData.user = null;
        if (typeof app.applyRuntimeConfig === 'function') app.applyRuntimeConfig();
        this.setData({ devSheetOpen: false });
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },

  copyApi() {
    const url = this.data.apiBaseUrl || LOCAL_API_BASE_URL;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },

  logout() {
    api.logout().then(() => wx.reLaunch({ url: '/pages/login/login' }));
  },
});
