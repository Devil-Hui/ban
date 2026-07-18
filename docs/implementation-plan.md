# 排班小程序 — 工程实现方案（v1 落地）

> 版本: v1 | 日期: 2026-07-07 | 配套: `business-flows.md`(v3.5) + `api-spec.md`(v1) + `user-scenarios.md`(v3.5)
> 目标: 补齐现有设计文档在 **H5 查看方式 / 小程序更新机制 / 一致性代码落地 / 数据库配置 / 环境变量切换** 五方面的工程缺口，给出可直接落地的代码骨架。

---

## 0. 问题定位（Gap Analysis）

| # | 用户要求 | 现有文档状态 | 缺口（Gap） | 修复目标 |
|---|---------|------------|------------|---------|
| 1 | H5 端查看方式 | `api-spec.md` 仅定义 H5 admin 接口 + SSE 指标流 | 缺部署形态、路由、公开分享预览页、跨端鉴权，无法"预览" | 给出运维后台 + 公开分享预览两类 H5 的部署/路由/鉴权方案 |
| 2 | 小程序内部更新机制 | `api-spec` A7⑤ 仅覆盖 H5 实时（SSE） | 小程序**不支持 SSE**，端内无任何实时/拉取机制描述 | 给出 onShow 拉取 + 下拉刷新 + WebSocket + 订阅消息触发 + 缓存降级 |
| 3 | 数据一致性保障 | A7/E 是设计规范 | 缺事务/乐观锁/事件/对账的**代码落地** | 给出事务封装、乐观锁 helper、事件发布、前端 diff、对账云函数 |
| 4 | 数据库配置及表设计 | v3.5 表字段合理 | 缺连接配置（池/字符集/时区/超时）、索引汇总、引擎 | 给出连接池配置、索引汇总、InnoDB DDL 片段 |
| 5 | 环境变量切换连接 | 完全缺失 | 无法灵活切换 dev/staging/prod 的 DB 地址 | 给出 `config/index.js` + 云函数环境变量 + 三套配置 |

> 约定：后端以 **Node（CloudBase 云函数 / 云托管）** 为基准，MySQL 驱动用 `mysql2/promise`。所有代码骨架均需配合 `api-spec.md` 的接口契约。

---

## 1. H5 端查看方式

### 1.1 两类 H5 页面

| 类型 | 路径 | 受众 | 鉴权 | 数据 | 实时 |
|------|------|------|------|------|------|
| **运维后台** `admin` | `/admin/*` | superadmin / admin | 账号密码 + JWT | 业务聚合指标 + 治理操作 | SSE 大屏 |
| **公开分享预览** `share` | `/share/tasks/{id}?token=xxx` | 非小程序用户（收到链接） | `share_token`（7天有效） | 脱敏排班结果（只读） | 无（静态快照） |

### 1.2 运维后台（admin）部署与接入

**部署形态**（任选其一，推荐云托管）：
- **方案 A（云开发静态托管 + 云函数 API）**：H5 静态资源传 `static` 托管；API 走云函数 `/api/v1/admin/*`。
- **方案 B（云托管 Container）**：一个 Node 服务同时托管 H5 静态目录与 `/admin` API，SSE 天然支持，运维最省心。

**前端 SSE 订阅（实时大屏）**（api-spec A7⑤）：
```js
// web/admin/metrics-stream.js
export function connectMetricsStream(onData) {
  const es = new EventSource('/api/v1/admin/metrics/stream', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  es.onmessage = (e) => onData(JSON.parse(e.data));
  es.onerror = () => {
    // 降级：30s 轮询（api-spec A7⑤ 规定）
    setTimeout(pollMetricsFallback, 30000);
  };
  return es;
}
```

### 1.3 公开分享预览页（share）— 解决"非小程序用户怎么看排班"

这是现有设计**完全缺失**的关键页：成员把排班分享到微信群以外（浏览器/QQ）时，对方无小程序，必须有 H5 版。

**路由与鉴权**：
- 路由：`GET /share/tasks/{taskId}?token={share_token}`
- 后端校验 `share_token` 存在且未过期（7天）→ 返回**脱敏**数据（姓名 + `138****1234`，无微信号）
- 过期/缺失 → `410 GONE` / `403 FORBIDDEN`（api-spec B11 已定义）
- 该页**只读**，不暴露任何写接口

**H5 渲染骨架**：
```html
<!-- static/share/tasks/[id].html -->
<div id="schedule"></div>
<script>
  const token = new URLSearchParams(location.search).get('token');
  fetch(`/api/v1/share/tasks/${TASK_ID}?token=${token}`)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(renderSchedule)   // 渲染姓名 + 脱敏手机号网格
    .catch(showExpired);     // 展示"链接已失效，请在微信中打开小程序"
</script>
```

### 1.4 部署配置骨架

**云托管 `Dockerfile`**（方案 B）：
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]   # 同时 serve /static 与 /api、/admin、/share
```

**Nginx（独立部署时）**关键路由：
```nginx
location /api/     { proxy_pass http://backend; }      # 云函数/云托管
location /admin/   { root /var/www/h5-admin; try_files $uri /index.html; }
location /share/   { root /var/www/h5-share; try_files $uri /index.html; }
```

### 1.5 跨端鉴权边界

- **小程序端**：`wx.login` → `code` → 后端换 `openid` → 发 JWT（api-spec B1）。
- **H5 admin**：账号密码 → `POST /admin/login` → JWT（`account_type=admin/superadmin`）。
- **H5 share**：仅 `share_token`，**无 JWT**，只读脱敏。
- 三者共用同一 MySQL，靠 `Authorization` 头与 `share_token` 区分信任域，权限矩阵见 `business-flows.md` 第六章。

---

## 2. 小程序内部更新机制

> 核心约束：小程序**不支持 SSE / EventSource**。实时能力只能用 **WebSocket**（`wx.connectSocket`，须 `wss://` 且域名已配置）或**轮询**。

### 2.1 三层刷新模型

| 层级 | 触发 | 适用页面 | 实时性 |
|------|------|---------|--------|
| L1 onShow 拉取 | 页面重新可见（`onShow`） | 全部页面 | 中（进入即新） |
| L2 下拉刷新 | 用户手动下拉 | 列表/详情页 | 用户主动 |
| L3 WebSocket | 服务端推送变更 | 任务详情、日程页（发布者/成员） | 高（秒级） |
| L4 订阅消息 | 点击订阅消息进入 | 对应任务页 | 事件驱动 |
| L5 本地缓存 | 首屏秒开 + 断网兜底 | 全部 | 离线 |

### 2.2 `utils/sync.js` — 统一拉取 + 缓存封装

```js
// utils/sync.js
const { request } = require('./request');

// 带缓存的拉取：先返回缓存（秒开），再拉网络覆盖
async function pullWithCache(key, url, { force = false } = {}) {
  const cache = wx.getStorageSync(key);
  if (cache && !force) {
    // 先渲染缓存，再后台更新
    Promise.resolve(cache).then(d => this._apply && this._apply(d));
  }
  const fresh = await request({ url });
  wx.setStorageSync(key, fresh);   // 写缓存（带版本号）
  return fresh;
}

// 版本对比：服务端返回 data.version，本地低则覆盖，高则忽略（防回滚）
function isNewer(local, remote) {
  return !local || (remote.version || 0) > (local.version || 0);
}

module.exports = { pullWithCache, isNewer };
```

### 2.3 `utils/socket.js` — WebSocket 管理（心跳/重连/降级）

```js
// utils/socket.js
let socketTask = null;
let heartbeatTimer = null;
const listeners = {};

function connectSocket() {
  if (socketTask) return;
  socketTask = wx.connectSocket({
    url: `${getApp().globalData.wsBase}/ws?token=${wx.getStorageSync('access_token')}`,
    // 必须 wss://，域名在微信后台「socket 合法域名」配置
  });

  socketTask.onMessage((res) => {
    const msg = JSON.parse(res.data);
    (listeners[msg.type] || []).forEach(cb => cb(msg.payload));
    if (msg.type === 'task.published' || msg.type === 'member.kicked') {
      // 收到变更 → 立即触发对应页面 onShow 拉取
      getCurrentPages().forEach(p => p.onShow && p.onShow(true));
    }
  });

  socketTask.onClose(() => {
    clearInterval(heartbeatTimer);
    socketTask = null;
    setTimeout(connectSocket, 3000);   // 断线 3s 重连
  });

  // 心跳保活（微信要求 60s 内有数据，否则被掐）
  heartbeatTimer = setInterval(() => {
    socketTask.send({ data: JSON.stringify({ type: 'ping' }) });
  }, 30000);
}

function on(type, cb) { (listeners[type] = listeners[type] || []).push(cb); }

// 降级：WS 不可用 → 任务详情页 10s 轮询（与 api-spec A7⑤ H5 降级同思路）
function startPolling(taskId, fn) {
  return setInterval(async () => {
    const fresh = await require('./request')
      .request({ url: `/tasks/${taskId}` });
    if (isNewer(getApp().globalData[`task_${taskId}`], fresh)) fn(fresh);
  }, 10000);
}

module.exports = { connectSocket, on, startPolling };
```

### 2.4 页面接入示例（任务详情）

```js
// pages/task-detail/task-detail.js
const { pullWithCache, isNewer } = require('../../utils/sync');
const socket = require('../../utils/socket');

Page({
  data: { task: null },
  onLoad(o) { this.taskId = o.id; socket.connectSocket(); socket.on('task.published', () => this.refresh()); },
  onShow(forced) { this.refresh(forced); },          // L1：进入即拉最新
  async refresh(force) {
    const key = `task_${this.taskId}`;
    const fresh = await pullWithCache(key, `/tasks/${this.taskId}`, { force });
    if (isNewer(this.data.task, fresh)) this.setData({ task: fresh });
  },
  onPullDownRefresh() {                              // L2：手动刷新
    this.refresh(true).then(() => wx.stopPullDownRefresh());
  },
});
```

### 2.5 订阅消息触发刷新（L4）

用户点击订阅消息卡片进入小程序 → 目标页 `onShow` 自动触发 `refresh(true)`，无需额外代码（L1 已覆盖）。这是 api-spec「发布后推订阅消息」闭环的最后一环。

### 2.6 降级策略

| 场景 | 行为 |
|------|------|
| WS 连接失败 | 切 10s 轮询（2.3 `startPolling`） |
| 弱网/超时 | 显示缓存数据 + Toast「已显示离线内容」 |
| 小程序退后台 | 关闭 WS，onShow 再连（省电） |

---

## 3. 数据一致性保障（代码落地）

> 设计见 `api-spec.md` A7/E。下面给可落地的 Node 骨架。

### 3.1 事务封装

```js
// db/transaction.js
const pool = require('./pool');   // 见 §4.1 连接池

async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
module.exports = { transaction };
```

**发布方案原子写**（api-spec A7① 事务边界）：
```js
await transaction(async (conn) => {
  await conn.query(
    `UPDATE tasks SET final_schedule=?, share_token=?, status='published', version=version+1
     WHERE id=? AND version=?`,
    [final, newToken, taskId, expectedVersion]
  );
  await conn.query('INSERT INTO user_assignments (...) VALUES ?', [assignRows]);
  await conn.query('INSERT INTO task_receipts (...) VALUES ?', [receiptRows]);
  await conn.query('INSERT INTO notify_queue (...) VALUES ?', [notifyRows]);
  await publishEvent('task.published', { taskId });   // 见 3.3
});
```

### 3.2 乐观锁 helper（防并发覆盖）

```js
// db/optimistic.js
// 通用 UPDATE + version 校验，影响行数 0 → 抛 409
async function updateWithVersion(conn, table, id, expectedVersion, setClause, params) {
  const [res] = await conn.query(
    `UPDATE ${table} SET ${setClause}, version=version+1
     WHERE id=? AND version=?`,
    [...params, id, expectedVersion]
  );
  if (res.affectedRows === 0) {
    const err = new Error('CONFLICT');
    err.code = 'CONFLICT';          // api-spec A7② → 409
    throw err;
  }
}
```

### 3.3 领域事件发布（Redis → 触发 SSE / WS 推送）

```js
// events/publisher.js
const redis = require('./redis');

async function publishEvent(type, payload) {
  await redis.publish('domain.events', JSON.stringify({ type, payload, ts: Date.now() }));
  // H5 SSE 订阅 redis 频道 → 推送在线 admin
  // 小程序 WS 网关订阅同频道 → 推送在线小程序会话（§2.3）
}
```

### 3.4 前端 diff + 冲突处理

- 小程序端每次 `refresh` 拿 `remote.version`，本地 `isNewer()` 判断（2.2）。
- 提交写带 `If-Match: version` 头（api-spec A7②）；服务端返回 `409` → 前端弹「数据已被他人修改，是否拉取最新并重试？」→ 拉最新后重放用户操作。

### 3.5 每日对账云函数（最终一致兜底）

```js
// cloud-functions/reconcile/index.js（定时触发器，每日 03:00）
exports.main = async () => {
  // 1. user_assignments 与 tasks.final_schedule 一致性
  const broken = await db.query(`
    SELECT a.id FROM user_assignments a
    JOIN tasks t ON t.id=a.task_id
    WHERE a.is_active=1 AND a.date NOT IN (SELECT JSON_EXTRACT(...))  -- 简化示意
  `);
  // 2. group_members 孤儿引用（user_id 不存在于 users）
  // 3. 异常写 audit_logs + 告警
  for (const b of broken) {
    await db.query('INSERT INTO audit_logs (action, target_id, reason) VALUES (?,?,?)',
      ['reconcile.fix', b.id, 'assignment mismatch']);
  }
  return { fixed: broken.length };
};
```

---

## 4. 数据库配置及表设计

### 4.1 连接配置（连接池 / 字符集 / 时区 / 超时）

```js
// db/pool.js
const mysql = require('mysql2/promise');
const config = require('../config');   // 见 §5

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  charset: 'utf8mb4',                  // 支持 emoji（微信昵称）
  timezone: '+00:00',                  // 统一 UTC 存储（api-spec A8）
  connectionLimit: 10,                // 云函数并发上限，避免打满
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  connectTimeout: 10000,
  acquireTimeout: 10000,
  // 生产建议开启 SSL：ssl: { ca: fs.readFileSync(config.db.caPath) }
});

module.exports = pool;
```

**关键配置项清单**：

| 项 | 值 | 说明 |
|----|----|----|
| charset | `utf8mb4` | 昵称含 emoji |
| collation | `utf8mb4_general_ci` | 默认排序 |
| timezone | `+00:00` (UTC) | 与 api-spec A8 一致，响应带 `Z` |
| engine | `InnoDB` | 支持事务 |
| connectionLimit | 10 | 云函数实例并发 |
| SQL_MODE | `STRICT_TRANS_TABLES,NO_ZERO_DATE` | 防脏数据 |

### 4.2 索引汇总（v3.5 表）

| 表 | 关键索引 | 用途 |
|----|---------|------|
| users | `uk_openid(openid)`, `uk_username(username)`, `idx_account_status(account_type,status)` | 登录/封禁查询 |
| groups | `uk_invite_code(invite_code)`, `idx_created_by(created_by)` | 邀请加入/我的分组 |
| group_members | `uk_group_user(group_id,user_id)` | 行级隔离（重入判断） |
| tasks | `idx_group_status(group_id,status)`, `idx_publisher(publisher_id)`, `idx_deadline(deadline)`, `uk_share_token(share_token)`, `idx_status_job(status,generating_job_id)` | 列表/调度/预览 |
| task_responses | `uk_task_user(task_id,user_id)` | 隐私隔离 + UPSERT |
| task_receipts | `uk_task_user(task_id,user_id)` | 查收状态 |
| countdowns | `idx_target_status(target_time,status)` | 调度器扫描（流程11） |
| user_assignments | `idx_user_date_active(user_id,date,is_active)` | 日程页查询（F4） |
| notify_queue | `idx_status_scheduled(status,scheduled_at)` | 推送扫描 |
| audit_logs | `idx_target(target_type,target_id)` | 审计追溯 |

### 4.3 建表 DDL 片段（关键表，含引擎/字符集/注释）

```sql
CREATE TABLE `tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `status` ENUM('collecting','reviewing','adjusting','published','archived') NOT NULL DEFAULT 'collecting',
  `final_schedule` JSON DEFAULT NULL,
  `candidate_schedules` JSON DEFAULT NULL,
  `previous_schedule` JSON DEFAULT NULL,
  `share_token` VARCHAR(64) DEFAULT NULL,
  `version` INT UNSIGNED NOT NULL DEFAULT 0,            -- 乐观锁
  `deadline` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_group_status` (`group_id`,`status`),
  KEY `idx_deadline` (`deadline`),
  KEY `uk_share_token` (`share_token`),
  CONSTRAINT `fk_tasks_group` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='排班任务(v3.5)';
```

### 4.4 表设计合理性确认

v3.5 表结构（`business-flows.md` 第二章）已满足：
- 乐观锁 `version` 在 `tasks / groups / group_members`（G2）
- 软删除统一用 `status/is_valid/is_active`，无物理 DELETE（A7⑥）
- `share_token` 7天有效、脱敏边界明确（隐私三级）
- `schedule_jobs` 承载异步计算态（P9）
- `countdowns` 为调度唯一真相源（P2）

**结论**：表设计合理，无需结构调整，仅需补齐 §4.1 连接配置即可落地。

---

## 5. 环境变量 / 配置文件切换数据库连接

### 5.1 `config/index.js` — 按环境切换

```js
// config/index.js
const env = process.env.NODE_ENV || process.env.CB_ENV || 'development';

const presets = {
  development: {
    db: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'localpass',
      name: process.env.DB_NAME || 'schedule_dev',
    },
    redis: { host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 },
    wsBase: 'wss://dev.example.com',
  },
  staging: {
    db: {
      host: process.env.DB_HOST,           // 必须由环境变量注入，不可硬编码
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      name: process.env.DB_NAME,
    },
    redis: { host: process.env.REDIS_HOST, port: 6379 },
    wsBase: 'wss://staging.example.com',
  },
  production: {
    db: {
      host: process.env.DB_HOST,           // 云函数环境变量注入（见 5.2）
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      name: process.env.DB_NAME,
    },
    redis: { host: process.env.REDIS_HOST, port: 6379 },
    wsBase: 'wss://api.example.com',
  },
};

if (!presets[env]) throw new Error(`Unknown NODE_ENV: ${env}`);
// 校验生产环境必须来自环境变量（防误连本地库）
if (env === 'production' && !process.env.DB_HOST) {
  throw new Error('Production DB_HOST must come from env, not hardcoded');
}

module.exports = { env, ...presets[env] };
```

### 5.2 云函数环境变量注入（CloudBase）

在云函数配置中设置（控制台或 `cloudbaserc.json`）：
```json
{
  "functions": [{
    "name": "schedule-api",
    "envVariables": {
      "NODE_ENV": "production",
      "DB_HOST": "rm-xxxx.mysql.rds.aliyuncs.com",
      "DB_PORT": "3306",
      "DB_USER": "schedule_prod",
      "DB_PASSWORD": "{{secrets.DB_PASSWORD}}",   // 密钥管理，不落库
      "DB_NAME": "schedule_prod",
      "REDIS_HOST": "r-xxxx.redis.rds.aliyuncs.com"
    }
  }]
}
```

> 本地调试：CloudBase CLI `tcb fn deploy --envId prod` 自动注入；本地 `NODE_ENV=development` 读 `.env.local`（gitignore）。

### 5.3 三套环境切换演示

```bash
# 本地开发
NODE_ENV=development node cloud-functions/api/index.js

# 云开发（自动读取云函数环境变量）
tcb fn invoke schedule-api

# 生产（CI 注入 secrets）
NODE_ENV=production DB_HOST=rm-prod.xxx DB_PASSWORD=$PROD_DB_PWD node server.js
```

### 5.4 `.env.example` + `.gitignore`

```bash
# .env.example（入库，无真实密码）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=schedule_dev
REDIS_HOST=127.0.0.1
```

```gitignore
# .gitignore
.env
.env.local
.env.*.local
```
> 真实密钥（`.env.local` / 云函数 secret）**严禁入库**（api-spec A8 合规要求）。

### 5.5 切换连接地址的最小改动

只需改环境变量，**无需改代码**：
```bash
# 从测试库切到生产库，仅改这一行环境变量
export DB_HOST=rm-prod.xxx.mysql.rds.aliyuncs.com
```
`config/index.js` 自动读取，`db/pool.js` 重建连接池。

---

## 6. 落地优先级与验证

| 优先级 | 模块 | 验证方式 |
|-------|------|---------|
| P0 | §5 环境变量 + §4.1 连接池 | 改 `DB_HOST` 切库成功，连接池复用无泄漏 |
| P0 | §3.1 事务 + §3.2 乐观锁 | 并发发布同一 task → 只有一个 `version+1` 成功，另一个 `409` |
| P1 | §2 小程序更新机制 | onShow 进入即新；WS 推送发布 → 成员端秒级刷新 |
| P1 | §1.3 公开分享预览 | 浏览器打开 `/share/tasks/{id}?token=` 脱敏展示，过期返回 410 |
| P2 | §1.2 运维 SSE | 封禁用户 → 大屏指标 30s 内下降 |
| P2 | §3.5 每日对账 | 手动制造 assignment 不一致 → 次日对账修复并写 audit |

> 所有接口仍须先过 `api-spec.md` Part F 的契约测试（TDD 红-绿）再落地。

---

## 附：与现有文档的关系

- **不重复**：A7/E 的一致性**设计规范**保留；本文档是**代码落地**与**缺失模块补齐**。
- **字段一致**：全文使用 v3.5 字段名（`final_schedule` / `candidate_schedules` / `previous_schedule` / `generating_job_id` / `is_blacklisted` / `version`），与 `business-flows.md` v3.5 零冲突。
- **下一步**：可据此进入云函数实现（建议从 §5 + §4 的 DB 连接骨架开始，再写 §3 事务）。
