// utils/request.js — 统一网络请求层
// dataMode=local 时走 local-db，不访问网络；api 模式走 wx.request
const { getAccessToken, getRefreshToken, setTokens, clearTokens } = require('./auth');
const { baseUrl, requestTimeoutMs, useLocalMock } = require('./config');

const BASE_URL = baseUrl;
const SUCCESS_CODE = 0;
let refreshing = null;

function makeError(code, message, detail) {
  const e = new Error(message || 'error');
  e.code = code;
  e.message = message;
  if (detail) e.detail = detail;
  return e;
}

function request(opts) {
  const method = (opts.method || 'GET').toUpperCase();
  const auth = opts.auth !== false;
  const silent = opts.silent === true;

  // —— 纯本地模式：不启后端、不连 Docker/MySQL ——
  if (useLocalMock) {
    return new Promise((resolve, reject) => {
      try {
        const localDb = require('./local-db');
        const result = localDb.handle(method, opts.url, opts.data || {});
        if (result && result.ok) return resolve(result.data);
        const code = (result && result.code) || 4040;
        const message = (result && result.message) || '本地请求失败';
        if (!silent) wx.showToast({ title: message, icon: 'none' });
        reject(makeError(code, message));
      } catch (e) {
        if (!silent) wx.showToast({ title: '本地数据异常', icon: 'none' });
        reject(makeError(-1, e.message || '本地数据异常', e));
      }
    });
  }

  return new Promise((resolve, reject) => {
    const header = Object.assign(
      { 'Content-Type': 'application/json', 'X-Client-Type': 'miniprogram' },
      opts.header || {}
    );
    if (auth) {
      const token = getAccessToken();
      if (token) header['Authorization'] = 'Bearer ' + token;
    }
    wx.request({
      url: BASE_URL + opts.url,
      method,
      data: opts.data || {},
      header,
      timeout: requestTimeoutMs || 10000,
      success(res) {
        const body = res.data || {};
        if (res.statusCode < 200 || res.statusCode >= 300) {
          if ((res.statusCode === 401 || body.code === 4010) && !opts._retry && auth) {
            return handleUnauthorized(opts).then(resolve).catch(reject);
          }
          if (!silent) wx.showToast({ title: body.message || '服务暂时不可用', icon: 'none' });
          return reject(makeError(body.code || res.statusCode, body.message || '服务暂时不可用'));
        }
        if (body.code === SUCCESS_CODE || body.code === '0') return resolve(body.data);
        if ((body.code === 4010 || body.code === 4011 || body.code === 4012) && !opts._retry && auth) {
          return handleUnauthorized(opts).then(resolve).catch(reject);
        }
        if (!silent) wx.showToast({ title: body.message || '请求失败', icon: 'none' });
        reject(makeError(body.code, body.message || '请求失败'));
      },
      fail(err) {
        if (!silent) {
          wx.showToast({
            title: '网络异常：请启动后端或改 config.dataMode=local',
            icon: 'none',
            duration: 2500,
          });
        }
        reject(makeError(-1, '网络异常', err));
      },
    });
  });
}

function handleUnauthorized(opts) {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing.then(() => request(Object.assign({}, opts, { _retry: true })));
}

function doRefresh() {
  const rt = getRefreshToken();
  if (!rt) return Promise.reject(makeError(4010, '登录已过期，请重新登录'));
  if (useLocalMock) {
    const localDb = require('./local-db');
    const result = localDb.handle('POST', '/auth/refresh', { refreshToken: rt });
    if (result && result.ok && result.data && result.data.accessToken) {
      setTokens(result.data.accessToken, result.data.refreshToken);
      return Promise.resolve(result.data);
    }
    clearTokens();
    return Promise.reject(makeError(4010, '登录已过期，请重新登录'));
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + '/auth/refresh',
      method: 'POST',
      data: { refreshToken: rt },
      header: { 'Content-Type': 'application/json', 'X-Client-Type': 'miniprogram' },
      success(res) {
        const body = res.data || {};
        if (body.code === SUCCESS_CODE && body.data && body.data.accessToken) {
          setTokens(body.data.accessToken, body.data.refreshToken);
          resolve(body.data);
        } else {
          clearTokens();
          reject(makeError(4010, '登录已过期，请重新登录'));
        }
      },
      fail() {
        clearTokens();
        reject(makeError(4010, '登录已过期，请重新登录'));
      },
    });
  });
}

const get = (url, data, opts) => request(Object.assign({ url, method: 'GET', data }, opts));
const post = (url, data, opts) => request(Object.assign({ url, method: 'POST', data }, opts));
const put = (url, data, opts) => request(Object.assign({ url, method: 'PUT', data }, opts));
const patch = (url, data, opts) => request(Object.assign({ url, method: 'PATCH', data }, opts));
const del = (url, data, opts) => request(Object.assign({ url, method: 'DELETE', data }, opts));

module.exports = { request, get, post, put, patch, del, BASE_URL };
