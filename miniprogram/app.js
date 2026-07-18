// app.js — 排班协同：设计稿 UI + 本地后端联调
const { silentLogin, getStoredUser, setStoredUser } = require('./utils/auth');
const store = require('./utils/store');

App({
  globalData: {
    designVersion: 'v4.0',
    // 与 app.wxss / app.json tabBar selectedColor 一致（v4 主色）
    themeColor: '#2B6DE5',
    // 设计稿页面使用 currentUser；业务联调同时维护 user
    currentUser: null,
    user: null,
    tokenReady: false,
    loginReady: false,
    loginReadyCallbacks: [],
  },

  onLaunch() {
    // 优先恢复本地缓存，避免闪白
    const cached = getStoredUser() || wx.getStorageSync('currentUser') || null;
    if (cached && (cached.id || cached.nickname)) {
      this._setUser(cached, { ready: false });
    }
    this.bootstrap();
  },

  async bootstrap() {
    try {
      const user = await silentLogin();
      this._setUser(user, { ready: true });
      store.emit('login', user);
    } catch (err) {
      console.warn('[app] silent login failed:', err && err.message);
      // 设计稿可继续用缓存/游客展示；写操作再 ensureLogin
      const fallback =
        this.globalData.currentUser ||
        getStoredUser() || {
          id: 'local_guest',
          nickname: '本地用户',
          initial: '本',
          avatarUrl: '',
          role: 'user',
        };
      this._setUser(fallback, { ready: !!getStoredUser() });
    }
  },

  _setUser(user, { ready }) {
    const normalized = normalizeUser(user);
    this.globalData.user = normalized;
    this.globalData.currentUser = normalized;
    this.globalData.tokenReady = !!ready;
    this.globalData.loginReady = true; // UI 可渲染
    store.setUser(normalized);
    try {
      wx.setStorageSync('currentUser', normalized);
    } catch (_) {}
    this.fireLoginReady();
  },

  fireLoginReady() {
    const cbs = this.globalData.loginReadyCallbacks || [];
    this.globalData.loginReadyCallbacks = [];
    cbs.forEach((cb) => {
      try {
        cb(this.globalData.currentUser);
      } catch (e) {
        console.warn('[app] loginReady cb error', e);
      }
    });
  },

  // 设计稿页面：等待登录完成
  onLoginReady(cb) {
    if (this.globalData.loginReady) {
      cb(this.globalData.currentUser);
    } else {
      this.globalData.loginReadyCallbacks.push(cb);
    }
  },

  // 业务页：确保有 token
  ensureLogin() {
    if (this.globalData.tokenReady && this.globalData.user && this.globalData.user.id) {
      return Promise.resolve(this.globalData.user);
    }
    return silentLogin().then((user) => {
      this._setUser(user, { ready: true });
      store.emit('login', user);
      return user;
    });
  },

  logout() {
    try {
      wx.removeStorageSync('currentUser');
    } catch (_) {}
    const { clearTokens } = require('./utils/auth');
    clearTokens();
    this.globalData.currentUser = null;
    this.globalData.user = null;
    this.globalData.tokenReady = false;
    this.globalData.loginReady = false;
  },
});

function normalizeUser(user) {
  const u = user || {};
  const nickname = u.nickname || u.nickName || '微信用户';
  const initial = (nickname && String(nickname).trim().charAt(0)) || '我';
  return Object.assign({}, u, {
    id: u.id || u.userId || '',
    nickname,
    initial,
    avatarUrl: u.avatarUrl || u.avatar || '',
    avatar: u.avatar || u.avatarUrl || '',
    role: u.role || 'user',
  });
}
