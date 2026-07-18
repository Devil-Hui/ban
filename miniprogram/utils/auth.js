// utils/auth.js — 登录态与 token 管理
// 注意：本文件被 request.js 依赖；为避免循环依赖，wx.request 的封装在调用时再 require。
const KEY_ACCESS = 'access_token';
const KEY_REFRESH = 'refresh_token';
const KEY_USER = 'user';

function getAccessToken() {
  return wx.getStorageSync(KEY_ACCESS) || '';
}
function getRefreshToken() {
  return wx.getStorageSync(KEY_REFRESH) || '';
}
function setTokens(accessToken, refreshToken) {
  if (accessToken) wx.setStorageSync(KEY_ACCESS, accessToken);
  if (refreshToken) wx.setStorageSync(KEY_REFRESH, refreshToken);
}
function clearTokens() {
  wx.removeStorageSync(KEY_ACCESS);
  wx.removeStorageSync(KEY_REFRESH);
  wx.removeStorageSync(KEY_USER);
}
function getStoredUser() {
  return wx.getStorageSync(KEY_USER) || null;
}
function setStoredUser(user) {
  if (user) wx.setStorageSync(KEY_USER, user);
}

/**
 * 解包后端 data：兼容 { accessToken, user } 与仅 token 包络。
 * 登录成功后若无 user，再拉 /users/me 补齐（与后端 handler 契约对齐）。
 */
function unwrapLoginData(data) {
  if (!data) return { accessToken: '', refreshToken: '', user: null };
  return {
    accessToken: data.accessToken || data.token || '',
    refreshToken: data.refreshToken || '',
    user: data.user || null,
  };
}

/**
 * 静默登录：wx.login 拿 code -> 后端换 token + 用户
 * POST /api/v1/auth/miniprogram/login { code } -> { accessToken, refreshToken, user? }
 */
function exchangeCode(code) {
  const request = require('./request');
  return request
    .post('/auth/miniprogram/login', { code }, { auth: false, silent: true })
    .then(async (raw) => {
      const data = unwrapLoginData(raw);
      if (!data.accessToken) throw new Error('登录未返回 accessToken');
      setTokens(data.accessToken, data.refreshToken);
      let user = data.user;
      if (!user || !user.id) {
        try {
          const me = await request.get('/users/me', null, { silent: true });
          user = (me && me.user) || me || {};
        } catch (_) {
          user = user || {};
        }
      }
      setStoredUser(user);
      return user;
    });
}

/**
 * 静默登录：
 * - config.dataMode=local：不依赖后端/Docker，本地用户
 * - api：wx.login code → 后端（后端可用 memory，无需 MySQL）
 */
function silentLogin() {
  let useLocalMock = false;
  try {
    useLocalMock = !!require('./config').useLocalMock;
  } catch (_) {}
  if (useLocalMock) {
    return exchangeCode('local_mock_' + Date.now());
  }
  return new Promise((resolve, reject) => {
    const finish = (code) => {
      exchangeCode(code).then(resolve).catch(reject);
    };
    try {
      wx.login({
        success: ({ code }) => {
          if (code) return finish(code);
          console.warn('[auth] wx.login empty code, fallback local mock');
          finish('local_dev_' + Date.now());
        },
        fail: (err) => {
          console.warn('[auth] wx.login fail, fallback local mock', err);
          finish('local_dev_' + Date.now());
        },
      });
    } catch (e) {
      console.warn('[auth] wx.login throw, fallback local mock', e);
      finish('local_dev_' + Date.now());
    }
  });
}

/**
 * 主动登录（用户点击「登录」时）：弹授权拿用户信息后补全昵称头像
 * 注意：getUserProfile 必须由用户点击触发，不可 onLoad 静默调用。
 */
function loginWithProfile() {
  const request = require('./request');
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于完善你的排班档案',
      success: (profile) => {
        silentLogin()
          .then((user) => {
            const patch = {
              nickname: profile.userInfo.nickName,
              avatarUrl: profile.userInfo.avatarUrl,
            };
            // 字段与后端 PATCH /users/me 对齐（avatarUrl）
            return request.patch('/users/me', patch).then((res) => {
              const merged = Object.assign({}, user, (res && res.user) || patch, {
                avatar: patch.avatarUrl,
              });
              setStoredUser(merged);
              resolve(merged);
            });
          })
          .catch(reject);
      },
      fail: (err) => reject(err),
    });
  });
}

/**
 * 页面写操作前确保登录：已有 token 则直接过，否则 silentLogin。
 */
function ensureLogin() {
  if (getAccessToken() && getStoredUser()) {
    return Promise.resolve(getStoredUser());
  }
  return silentLogin();
}

module.exports = {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getStoredUser,
  setStoredUser,
  silentLogin,
  loginWithProfile,
  ensureLogin,
};
