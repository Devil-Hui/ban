/**
 * Develop-only runtime overrides (storage).
 * Production / trial always follow extConfig + real WeChat login.
 */

const STORAGE_KEY = 'scheduling-env-override';

function readOverride() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return {};
    return {
      authMode: raw.authMode === 'production' || raw.authMode === 'mock' ? raw.authMode : undefined,
      apiBaseUrl: typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl.trim() : undefined,
    };
  } catch {
    return {};
  }
}

function writeOverride(patch = {}) {
  const next = { ...readOverride(), ...patch };
  if (next.authMode !== 'production' && next.authMode !== 'mock') delete next.authMode;
  if (!next.apiBaseUrl) delete next.apiBaseUrl;
  wx.setStorageSync(STORAGE_KEY, next);
  return next;
}

function clearOverride() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Wipe local session + env override for a clean init state. */
function clearAppLocalState() {
  const keys = [
    'scheduling-access-token',
    'scheduling-refresh-token',
    'scheduling-user',
    'scheduling-current-task',
    'scheduling-share-token',
    'scheduling-auto-confirm',
    STORAGE_KEY,
  ];
  keys.forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch {
      /* ignore */
    }
  });
}

module.exports = {
  STORAGE_KEY,
  readOverride,
  writeOverride,
  clearOverride,
  clearAppLocalState,
};
