const api = require('../../utils/api');

Page({
  data: {
    authMode: 'production',
    isDevelop: false,
    configurationError: '',
    loading: false,
    error: '',
  },

  onLoad() {
    this.syncEnv();
  },

  onShow() {
    this.syncEnv();
    if (wx.getStorageSync('scheduling-access-token')) {
      wx.reLaunch({ url: '/pages/home/home' });
    }
  },

  syncEnv() {
    const app = getApp();
    if (typeof app.applyRuntimeConfig === 'function') app.applyRuntimeConfig();
    const { authMode, configurationError, isDevelop } = app.globalData;
    this.setData({
      authMode,
      configurationError: configurationError || '',
      isDevelop: Boolean(isDevelop),
    });
  },

  submit() {
    if (this.data.loading || this.data.configurationError) return;
    this.setData({ loading: true, error: '' });
    // Always present as WeChat login. Production uses wx.login (see api.js).
    // Develop default may use server-side mock credentials without UI wording.
    const options =
      this.data.authMode === 'mock'
        ? { interactive: true, mockUserId: 'U03' }
        : { interactive: true };
    api
      .login(options)
      .then(() => wx.reLaunch({ url: '/pages/home/home' }))
      .catch((error) => this.setData({ error: api.errorMessage(error, '登录失败，请稍后重试') }))
      .finally(() => this.setData({ loading: false }));
  },
});
