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

  onGetPhoneNumber(e) {
    if (this.data.loading || this.data.configurationError) return;

    const errMsg = e.detail?.errMsg || '';
    // 用户主动拒绝授权 → 不做任何提示
    if (errMsg.indexOf('deny') !== -1) return;

    // 授权成功 → 走手机号登录
    if (errMsg === 'getPhoneNumber:ok' && e.detail.code) {
      this.setData({ loading: true, error: '' });
      api.phoneLogin({ phoneCode: e.detail.code })
        .then(() => wx.reLaunch({ url: '/pages/home/home' }))
        .catch(() => {
          this.setData({ loading: false });
          this._fallbackLogin('已切换为微信快捷登录');
        });
      return;
    }

    // 授权失败（devtools / 未认证 / 其他）→ 自动降级为静默登录
    this._fallbackLogin('手机号授权暂不可用，已切换为微信快捷登录');
  },

  /** 静默登录兜底 */
  _fallbackLogin(hint) {
    if (this.data.loading || this.data.configurationError) return;
    this.setData({ loading: true, error: '' });
    wx.showToast({ title: hint, icon: 'none', duration: 2000 });
    api.login({ interactive: true })
      .then(() => wx.reLaunch({ url: '/pages/home/home' }))
      .catch((error) => this.setData({ error: api.errorMessage(error, '登录失败，请稍后重试') }))
      .finally(() => this.setData({ loading: false }));
  },

  /** 旧版静默登录，mock 模式下仍需保留 */
  submit() {
    if (this.data.loading || this.data.configurationError) return;
    this.setData({ loading: true, error: '' });
    const options = this.data.authMode === 'mock'
      ? { interactive: true, mockUserId: 'U03' }
      : { interactive: true };
    api.login(options)
      .then(() => wx.reLaunch({ url: '/pages/home/home' }))
      .catch((error) => this.setData({ error: api.errorMessage(error, '登录失败，请稍后重试') }))
      .finally(() => this.setData({ loading: false }));
  },
});
