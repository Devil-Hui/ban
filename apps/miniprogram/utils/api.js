const app = getApp();

function errorMessage(error, fallback = '请求失败，请稍后重试') {
  return error?.data?.error?.message || error?.data?.message || error?.message || fallback;
}

function configurationError() {
  const error = new Error(app.globalData.configurationError || 'API 服务地址未配置');
  error.code = 'API_NOT_CONFIGURED';
  return error;
}

function normalizeMethod(method) {
  return String(method || 'GET').toUpperCase();
}

function needsJsonBody(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

/** Fastify rejects Content-Type: application/json with an empty body. Always send {}. */
function resolveRequestData(method, data) {
  if (data !== undefined && data !== null) return data;
  if (needsJsonBody(method)) return {};
  return data;
}

function rawRequest(path, options = {}, token) {
  if (!app.globalData.apiBaseUrl) return Promise.reject(configurationError());
  const method = normalizeMethod(options.method);
  const data = resolveRequestData(method, options.data);
  const header = {
    ...(needsJsonBody(method) ? { 'Content-Type': 'application/json' } : {}),
    ...(options.header || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}${path}`,
      method,
      data,
      header,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else reject({ statusCode: response.statusCode, data: response.data, message: errorMessage({ data: response.data }) });
      },
      fail(error) { reject(Object.assign(error || new Error('网络连接失败'), { message: errorMessage(error, '网络连接失败') })); },
    });
  });
}

function clearSession() {
  wx.removeStorageSync('scheduling-access-token');
  wx.removeStorageSync('scheduling-refresh-token');
  wx.removeStorageSync('scheduling-user');
  app.globalData.user = null;
}

let redirectingToLogin = false;
function redirectToLogin() {
  if (redirectingToLogin) return;
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (pages[pages.length - 1]?.route === 'pages/login/login') return;
  redirectingToLogin = true;
  wx.reLaunch({
    url: '/pages/login/login',
    complete() { redirectingToLogin = false; },
  });
}

let refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  const refreshToken = wx.getStorageSync('scheduling-refresh-token');
  if (!refreshToken) return Promise.reject(new Error('登录已失效'));
  refreshing = rawRequest('/auth/refresh', { method: 'POST', data: { refreshToken } })
    .then((data) => {
      wx.setStorageSync('scheduling-access-token', data.accessToken);
      wx.setStorageSync('scheduling-refresh-token', data.refreshToken);
      wx.setStorageSync('scheduling-user', data.user);
      app.globalData.user = data.user;
      return data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function request(path, options = {}) {
  const token = wx.getStorageSync('scheduling-access-token');
  return rawRequest(path, options, token).catch((error) => {
    if (error?.statusCode !== 401 || options._retried || path.startsWith('/auth/')) return Promise.reject(error);
    return refresh()
      .then(() => rawRequest(path, { ...options, _retried: true }, wx.getStorageSync('scheduling-access-token')))
      .catch((refreshError) => {
        clearSession();
        redirectToLogin();
        return Promise.reject(refreshError);
      });
  });
}

function login(options = {}) {
  if (wx.getStorageSync('scheduling-access-token')) return Promise.resolve(wx.getStorageSync('scheduling-user'));
  const interactive = options.interactive || Boolean(options.mockUserId);
  if (!interactive) {
    redirectToLogin();
    return Promise.reject(new Error('请先登录'));
  }

  const finish = (code) => rawRequest('/auth/wechat/login', { method: 'POST', data: { code } }).then((data) => {
    wx.setStorageSync('scheduling-access-token', data.accessToken);
    wx.setStorageSync('scheduling-refresh-token', data.refreshToken);
    wx.setStorageSync('scheduling-user', data.user);
    app.globalData.user = data.user;
    return data.user;
  });

  if (app.globalData.authMode === 'mock') {
    const mockUserId = /^U(?:0[1-9]|1[0-3])$/.test(options.mockUserId || '') ? options.mockUserId : 'U03';
    return finish(`mock:${mockUserId}`);
  }

  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) return reject(new Error('微信登录未返回有效凭证'));
        return finish(result.code).then(resolve, reject);
      },
      fail(error) { reject(Object.assign(error || new Error('微信登录失败'), { message: errorMessage(error, '微信登录失败') })); },
    });
  });
}

function logout() {
  const refreshToken = wx.getStorageSync('scheduling-refresh-token');
  const done = () => {
    clearSession();
    redirectToLogin();
  };
  if (!refreshToken) { done(); return Promise.resolve(); }
  return rawRequest('/auth/logout', { method: 'POST', data: { refreshToken } }).catch(() => {}).then(done);
}

function uploadFile(path, filePath, formKey = 'image') {
  return new Promise((resolve, reject) => {
    const apiBaseUrl = app.globalData.apiBaseUrl;
    if (!apiBaseUrl) { reject(configurationError()); return; }
    const token = wx.getStorageSync('scheduling-access-token') || '';
    wx.uploadFile({
      url: `${apiBaseUrl}${path}`,
      filePath,
      name: formKey,
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success(res) {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode >= 200 && res.statusCode < 300 && !data.error) resolve(data);
          else reject({ statusCode: res.statusCode, data });
        } catch { reject({ statusCode: res.statusCode, data: res.data }); }
      },
      fail(err) { reject(err); },
    });
  });
}

module.exports = { clearSession, errorMessage, login, logout, request, uploadFile };
