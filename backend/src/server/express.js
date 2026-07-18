'use strict';

/**
 * Express 本地服务入口（DB_MODE=memory 时无需数据库即可运行）。
 * 用法：node src/server/express.js  （或 npm start）
 */

const express = require('express');
const config = require('../config');
const { ok, fail, requestId } = require('../core/response');
const { fromExpress, authenticate } = require('../core/context');
const { ROUTES } = require('./routes');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  req.requestId = requestId();
  res.setHeader('X-Request-Id', req.requestId);
  // 简单 CORS（按配置）
  const origin = req.headers.origin;
  if (config.cors.allowOrigins.includes('*') || config.cors.allowOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Client-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 鉴权中间件：有 Authorization 则尝试解析并设置 req.user（无效不报错，交由 handler 决定）
app.use((req, res, next) => {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth) {
    try {
      req.user = authenticate(req.headers);
    } catch (_) {
      req.user = null;
    }
  }
  next();
});

// 统一适配：把路由表挂载到 Express
for (const r of ROUTES) {
  const method = r.method.toLowerCase();
  app[method](r.path, async (req, res) => {
    try {
      const ctx = fromExpress(req, req.params);
      const data = await r.handler(ctx);
      res.status(200).json(ok(data));
    } catch (e) {
      const status = e.httpStatus || 500;
      if (status >= 500) console.error('[API ERROR]', e);
      res.status(status).json(fail(e, req.requestId));
    }
  });
}

// 404
app.use((req, res) => {
  res.status(404).json(fail({ code: 4040, message: '接口不存在', httpStatus: 404 }, req.requestId));
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[scheduling-backend] listening on :${config.port} (mode=${config.dbMode})`);
  });
}

module.exports = app;
