const LOCAL_API_BASE_URL = 'http://127.0.0.1:3010/api/v1';
// 生产/体验环境 API 地址（HTTPS）。上线前替换为实际域名，并在小程序后台「开发管理→服务器域名」配置 request 合法域名。
// 独立小程序 fallback；若接入第三方平台代开发则 extConfig 优先。
const PRODUCTION_API_BASE_URL = 'https://api.scheduling.example.com/api/v1';

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
    // Priority: storage override > extConfig > default production (真实微信授权)
    let authMode = 'production';
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

  // trial/release：extConfig 优先，否则 fallback 到 PRODUCTION_API_BASE_URL 常量
  const resolvedUrl = configuredUrl || normalizeBaseUrl(PRODUCTION_API_BASE_URL);
  const secure = /^https:\/\//i.test(resolvedUrl);
  return {
    apiBaseUrl: secure ? resolvedUrl : '',
    authMode: 'production',
    envVersion,
    isDevelop: false,
    configurationError: secure ? '' : '体验版和正式版必须配置 HTTPS API 地址',
  };
}

module.exports = { LOCAL_API_BASE_URL, PRODUCTION_API_BASE_URL, resolveRuntimeConfig };
