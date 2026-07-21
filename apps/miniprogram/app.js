const { resolveRuntimeConfig } = require('./utils/runtime-config');
const { readOverride, clearAppLocalState } = require('./utils/env-settings');

App({
  globalData: {
    apiBaseUrl: '',
    authMode: 'production',
    envVersion: 'release',
    isDevelop: false,
    configurationError: '',
    user: null,
  },

  applyRuntimeConfig() {
    let accountInfo = {};
    let extConfig = {};
    try {
      accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : {};
    } catch {
      accountInfo = {};
    }
    try {
      extConfig = wx.getExtConfigSync ? wx.getExtConfigSync() : {};
    } catch {
      extConfig = {};
    }
    const override = readOverride();
    Object.assign(this.globalData, resolveRuntimeConfig({ accountInfo, extConfig, override }));
  },

  /** Clear session tokens for a clean launch (developer / QA). */
  clearSession() {
    clearAppLocalState();
    this.globalData.user = null;
  },

  onLaunch(options = {}) {
    // Cold start with query reset=1 → wipe local session (DevTools: 编译模式可加)
    if (options && (options.query?.reset === '1' || options.query?.reset === 1)) {
      this.clearSession();
    }
    this.applyRuntimeConfig();
    const cached = wx.getStorageSync('scheduling-user');
    if (cached) this.globalData.user = cached;
  },
});
