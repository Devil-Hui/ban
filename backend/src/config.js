'use strict';

/**
 * 统一配置入口。
 * 优先级：环境变量 > .env 文件 > 内置默认值。
 * 设计目标：通过环境变量或 .env 即可切换数据库连接地址，无需改动代码。
 */

const fs = require('fs');
const path = require('path');

// 零依赖读取 .env（仅本地/联调使用；生产由平台注入环境变量）
function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) {
    /* 忽略 .env 读取失败 */
  }
}
loadDotEnv();

function num(v, d) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  dbMode: process.env.DB_MODE || 'memory',
  port: num(process.env.PORT, 3000),
  apiVersion: 'v1',
  apiPrefix: '/api/v1',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    accessExpire: process.env.JWT_ACCESS_EXPIRE || '2h',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '14d',
  },

  // 数据库连接配置（DB_MODE=mysql 时生效）
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'scheduling',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    timezone: process.env.DB_TIMEZONE || '+00:00',
    connectionLimit: num(process.env.DB_POOL_LIMIT, 10),
    waitForConnections: true,
    connectTimeout: num(process.env.DB_CONNECT_TIMEOUT, 10000),
  },

  wechat: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
    mchId: process.env.WX_MCH_ID || '',
    mchKey: process.env.WX_MCH_KEY || '',
    notifyUrl: process.env.WX_PAY_NOTIFY_URL || '',
  },

  h5: {
    adminUsername: process.env.H5_ADMIN_USER || 'admin',
    adminPassword: process.env.H5_ADMIN_PASS || 'admin123',
  },

  cors: { allowOrigins: (process.env.CORS_ORIGINS || '*').split(',') },
  rateLimit: { windowMs: 60000, max: num(process.env.RATE_LIMIT_MAX, 120) },

  shareTokenTtl: num(process.env.SHARE_TOKEN_TTL, 604800),
  defaultPageSize: num(process.env.DEFAULT_PAGE_SIZE, 20),
  maxPageSize: num(process.env.MAX_PAGE_SIZE, 100),
  requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 8000),
};

module.exports = config;
