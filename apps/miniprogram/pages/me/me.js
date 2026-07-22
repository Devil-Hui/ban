const api = require('../../utils/api');
const { writeOverride, clearAppLocalState } = require('../../utils/env-settings');
const { LOCAL_API_BASE_URL } = require('../../utils/runtime-config');

/** 根据当前小时返回问候语 */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

Page({
  data: {
    /** 时段问候 */
    greeting: getGreeting(),
    /** 隐私手机号 */
    privacyPhone: '未授权',
    /** 用户对象 */
    user: {},
    /** 数据看板 */
    stats: {
      groupCount: 0,
      pendingTasks: 0,
      submissionCount: 0,
      totalShifts: 0,
    },
    /** 开发环境标志 */
    isDevelop: false,
    authMode: 'production',
    envVersion: '',
    apiBaseUrl: '',
    devSheetOpen: false,
    authModeLabel: '',
  },

  _versionTapCount: 0,
  _versionTapTimer: null,

  onShow() {
    this.refreshEnv();
    this.setData({ greeting: getGreeting() });
    this.loadUser();
    this.loadStats();
  },

  /* ----- 数据加载 ----- */

  loadUser() {
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

  /** 拉数据看板（允部分失败） */
  loadStats() {
    Promise.allSettled([
      api.request('/groups').then((data) => {
        const groups = Array.isArray(data) ? data : data?.items || [];
        this.setData({ 'stats.groupCount': groups.length });
      }),
      api.request('/scheduling/assignments/me?limit=1').then((data) => {
        const count = typeof data?.total === 'number' ? data.total : (Array.isArray(data) ? data.length : 0);
        this.setData({ 'stats.totalShifts': count });
      }),
    ]).catch(() => {});
  },

  /* ----- 环境 / 开关 ----- */

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

  /* ----- 页面路由 ----- */

  navigateTo(e) {
    const page = e.currentTarget.dataset.page;
    if (page) wx.navigateTo({ url: page });
  },

  openHelp() {
    wx.showModal({
      title: '帮助与反馈',
      content: '如遇使用问题，请联系排班管理员或发送邮件至 support@scheduling.example.com。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  openAbout() {
    wx.showModal({
      title: '智能排班',
      content: '让团队排班更高效、更透明。\n\n基于可用时间自动匹配，告别手动排班混乱。',
      showCancel: false,
      confirmText: '好的',
    });
  },

  /* ----- 手机号 / 注销 ----- */

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

  /* ----- 开发者面板 ----- */

  onVersionLongPress() {
    if (!this.data.isDevelop) return;
    this.refreshEnv();
    this.setData({ devSheetOpen: true });
  },
  closeDevSheet() { this.setData({ devSheetOpen: false }); },
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
