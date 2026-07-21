const LOCAL_API_BASE_URL = 'http://127.0.0.1:3010/api/v1';

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/**
 * Resolve API + auth mode.
 * - develop: default mock + local API; override via storage (env-settings) or extConfig
 * - trial/release: always production WeChat login + HTTPS from extConfig
 */
function resolveRuntimeConfig({ accountInfo = {}, extConfig = {}, override = {} } = {}) {
  const envVersion = accountInfo?.miniProgram?.envVersion || 'develop';
  const isDevelop = envVersion === 'develop';
  const configuredUrl = normalizeBaseUrl(override.apiBaseUrl || extConfig.apiBaseUrl);

  if (isDevelop) {
    const apiBaseUrl = configuredUrl || LOCAL_API_BASE_URL;
    const valid = /^https?:\/\//i.test(apiBaseUrl);
    // Priority: storage override > extConfig > default mock
    let authMode = 'mock';
    if (extConfig.authMode === 'production' || extConfig.authMode === 'mock') {
      authMode = extConfig.authMode;
    }
    if (override.authMode === 'production' || override.authMode === 'mock') {
      authMode = override.authMode;
    }
    return {
      apiBaseUrl: valid ? apiBaseUrl : '',
      authMode,
      envVersion,
      isDevelop: true,
      configurationError: valid ? '' : '开发环境 API 地址格式不正确',
    };
  }

  if (!configuredUrl) {
    return {
      apiBaseUrl: '',
      authMode: 'production',
      envVersion,
      isDevelop: false,
      configurationError: envVersion === 'release' ? '正式环境未配置 HTTPS API 地址' : '体验版未配置 HTTPS API 地址',
    };
  }

  const secure = /^https:\/\//i.test(configuredUrl);
  return {
    apiBaseUrl: secure ? configuredUrl : '',
    authMode: 'production',
    envVersion,
    isDevelop: false,
    configurationError: secure ? '' : '体验版和正式版必须配置 HTTPS API 地址',
  };
}

module.exports = { LOCAL_API_BASE_URL, resolveRuntimeConfig };
