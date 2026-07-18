const TOKEN_KEY = 'admin_access_token';
const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, { body, auth = true } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Type': 'h5',
  };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
  }
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.code !== 0 && json.code !== '0' && json.code != null)) {
    const msg = json.message || res.statusText || '请求失败';
    const err = new Error(msg);
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json.data !== undefined ? json.data : json;
}

export const api = {
  login: (username, password) =>
    request('POST', '/auth/h5/login', { body: { username, password }, auth: false }),
  overview: () => request('GET', '/admin/overview'),
  settings: () => request('GET', '/admin/settings'),
  putSettings: (body) => request('PUT', '/admin/settings', { body }),
  profiles: () => request('GET', '/schedule-profiles'),
  notifyTemplates: () => request('GET', '/meta/notify-templates', { auth: false }),
  timeConstants: () => request('GET', '/meta/time-constants', { auth: false }),
  auditLogs: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.pageSize) q.set('pageSize', params.pageSize);
    if (params.action) q.set('action', params.action);
    const s = q.toString();
    return request('GET', '/admin/audit-logs' + (s ? '?' + s : ''));
  },
};
