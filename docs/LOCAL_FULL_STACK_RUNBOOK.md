# 小程序 × H5 × MySQL 全链路打通操作手册

> **目标**：保证微信小程序、H5 运维台、Node API、MySQL 使用**同一套后端与同一库**，逻辑链完整可验收。  
> **规范**：配置相对包根、契约以 `routes.js` 为准、密钥不入库、软删/乐观锁/统一错误码（对齐既有阿里规范 schema 注释）。  
> **日期**：2026-07-18

---

## 0. 架构一句话

```
微信小程序 (dataMode=api)
        │  HTTP  /api/v1/*
        ▼
   Node Express  :3000
        │  DB_MODE=mysql
        ▼
   MySQL 库 paiban  (Docker: paiban-mysql)
        ▲
H5 运维台 admin-web :5173  (Vite 代理 /api → :3000)
```

**互通原则**：三端不直连库；只调同一 API；业务数据只在 `paiban` 落库。

---

## 1. 你需要提供 / 确认的信息（清单）

| # | 项 | 是否必须 | 说明 | 填哪里 |
|---|----|----------|------|--------|
| 1 | 本机已装 **Node ≥18**、**Docker Desktop**、**微信开发者工具** | 必须 | 跑 API / MySQL / 小程序 | 本机 |
| 2 | `backend/.env` 中 `DB_MODE=mysql`、`DB_NAME=paiban`、账号密码 | 必须（持久化互通） | 与 docker-compose 一致 | `backend/.env` |
| 3 | MySQL 容器 `paiban-mysql` 为 healthy | 必须 | `docker ps` 查看 | Docker |
| 4 | 小程序 **真实 AppID**（禁止 touristappid） | 必须 | 已有 `wx32b25e60a3131c4c` | `project.config.json` |
| 5 | `WX_APPID` + **`WX_SECRET`（AppSecret）** | 真机登录/微信推送必须 | 公众平台 → 开发设置 | `backend/.env` |
| 6 | 订阅模板 ID（你已提供 2 个） | 已配置 | 发布/加入 + 未提交 | `.env` + 小程序 config |
| 7 | H5 管理员账号密码 | 本地有默认 | `H5_ADMIN_USER/PASS` | `.env` |
| 8 | 公众平台模板**字段名**截图 | 可选 | 若微信下发报字段错误再改 `buildWxData` | 发给开发 |
| 9 | 合法 request 域名 / HTTPS | 上线必须 | 本地可关「校验合法域名」 | 公众平台 |
| 10 | Git remote | 可选 | 备份协作 | `git remote add` |

**当前本机探测（供对照）**：

- Docker：`paiban-mysql` 曾为 Up/healthy  
- 在 `backend/` 目录加载配置：`DB_MODE=mysql`、`DB_NAME=paiban`  
- 订阅模板：已写入  
- `WX_SECRET`：请在公众平台确认已填入 `.env`（空则真机 code2Session 失败，仅有 dev openid）  
- 单测：`npm test` → **43 pass**

---

## 2. 一次性环境准备（数据库打通）

### 2.1 启动 MySQL

```bash
cd D:\排班小程序\backend
docker compose up -d
docker compose ps
# 期望：paiban-mysql ... (healthy)
```

### 2.2 确认 / 修正 `backend/.env`（示例键，勿提交真密码）

```ini
NODE_ENV=development
DB_MODE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<与 docker-compose MYSQL_ROOT_PASSWORD 一致>
DB_NAME=paiban
PORT=3000

JWT_SECRET=<本地随机长串>
H5_ADMIN_USER=admin
H5_ADMIN_PASS=admin123

WX_APPID=<小程序 AppID>
WX_SECRET=<AppSecret，真机必须>

WX_TMPL_TASK_PUBLISHED=mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg
WX_TMPL_GROUP_JOINED=mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg
WX_TMPL_DEADLINE_REMIND=JQYOa6W-Fq1qZBSvJVD3vVRxfm2iQ2IaYQs-ex5DYic

# 体验版推送可设
# WX_MINI_STATE=trial
```

### 2.3 初始化表 + 种子（幂等）

```bash
cd D:\排班小程序\backend
node scripts/wait-mysql.js
node scripts/db-init.js
node scripts/db-seed-profiles.js
# 若库已存在但缺 share_token_expires_at：
# mysql ... < scripts/migrate-share-token-expires.sql
```

**验收 SQL（Chat2DB / mysql 客户端）**：

```sql
USE paiban;
SHOW TABLES;                    -- 约 15 张（无 payments_orders）
SELECT COUNT(*) FROM schedule_profiles;  -- 应有系统种子
```

---

## 3. 启动后端（统一 API）

```bash
cd D:\排班小程序\backend
npm install
npm test          # 期望 43 pass
npm run dev:mysql # 或：DB_MODE=mysql 已在 .env 时 npm start
```

**期望日志**：

```text
[scheduling-backend] listening on :3000 (mode=mysql)
```

**冒烟**：

```bash
# 小程序登录（开发假 openid 也可，有 WX_SECRET 则真 openid）
curl -s -X POST http://127.0.0.1:3000/api/v1/auth/miniprogram/login ^
  -H "Content-Type: application/json" -H "X-Client-Type: miniprogram" ^
  -d "{\"code\":\"smoke1\"}"

# H5 登录
curl -s -X POST http://127.0.0.1:3000/api/v1/auth/h5/login ^
  -H "Content-Type: application/json" -H "X-Client-Type: h5" ^
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

两者都应 `code:0`，且后续写操作落在 **同一 `paiban` 库**。

---

## 4. 启动 H5 运维台（与小程序共用 API）

```bash
cd D:\排班小程序\admin-web
npm install
npm run dev
```

打开：http://127.0.0.1:5173  

- 登录：`H5_ADMIN_*`  
- 修改 **默认 timeMode / defaultProfileId** 并保存  
- 在库中核对：

```sql
SELECT * FROM app_settings WHERE k IN ('defaultTimeMode','defaultProfileId');
```

小程序**新建任务**时应吃到该默认（同源 API `getSettings`）。

---

## 5. 微信小程序联调

### 5.1 工程配置

1. 微信开发者工具 → 导入 **`D:\排班小程序\miniprogram`**（不要只开仓库根）  
2. AppID：真实 ID  
3. 详情 → 本地设置 → **不校验合法域名**（仅开发）  
4. 确认 `miniprogram/utils/config.js`：

```js
dataMode: 'api'
// baseUrl → http://127.0.0.1:3000/api/v1
// subscribeTemplateIds 已填真实模板
```

### 5.2 主业务逻辑链（双角色验收）

| 步 | 角色 | 操作 | 后端/库落点 |
|----|------|------|-------------|
| 1 | A 发布者 | 静默登录 | `users` upsert |
| 2 | A | 创建分组 | `groups` + `group_members(publisher)` |
| 3 | B 成员 | 邀请码加入 | `group_members` + inbox「加入」 |
| 4 | A | style-select → task-create（可改 H5 默认 mode） | `tasks` periods 快照、`countdowns` |
| 5 | B（及 A） | task-mark 提交空闲 | `task_responses` |
| 6 | A | 生成方案 | `schedule_jobs` + `candidate_schedules` |
| 7 | A | 发布 | `tasks.status=published`、`user_assignments`、`share_token`、inbox |
| 8 | 任意 | 分享预览 token | `GET /share/tasks/:id?token=` 脱敏 |
| 9 | 系统 | `npm run worker:deadline` | 到期 reminder/deadline → reviewing + 通知 |

**互通验收点**：

1. H5 改默认 profile → 小程序新建任务 periods 来源一致  
2. 小程序建组/任务 → MySQL `paiban` 有行；H5 刷新模板列表仍来自同库种子  
3. 发布后双方「我的 → 消息中心」可见 inbox（同库 `notify_inbox`）

---

## 6. 截止 worker（逻辑链完整）

```bash
cd D:\排班小程序\backend
npm run worker:deadline
```

生产用系统计划任务 / cron **每分钟**执行一次。  
有 `WX_APPID/SECRET` + 用户已订阅 + 真 openid → 额外尝试微信服务通知。

---

## 7. 配置优先级（阿里/大厂惯例）

1. **进程环境变量**（K8s/云函数注入）最高  
2. **`backend/.env`**（包根，相对 `src/config.js` 解析）  
3. **代码默认值**（仅开发兜底，生产禁止依赖弱密钥）

契约优先级：

1. `backend/src/server/routes.js`  
2. `backend/API.md` / 行为单测  
3. `docs/api-spec.md`（可能落后）

---

## 8. 常见不通原因（对照表）

| 现象 | 原因 | 处理 |
|------|------|------|
| H5 有数据、小程序空 | 小程序 `dataMode=local` 或 baseUrl 错 | 改 `config.js` 为 api + :3000 |
| 重启后数据没了 | `DB_MODE=memory` | `.env` 改 mysql 并用 `dev:mysql` |
| 库名对不上 | 默认 scheduling vs paiban | 统一 `DB_NAME=paiban` |
| 登录失败 | 无 AppSecret / touristappid | 填 WX_SECRET、真 AppID |
| 微信服务通知没有 | 未订阅 / 无次数 / 字段不符 / 无 SECRET | 用户点击订阅；核对模板字段；配 SECRET |
| H5 登录 401 | 账号与 .env 不一致 | 核对 H5_ADMIN_* |
| CORS | 少见（同代理） | Express 已放行；直连注意头 |

---

## 9. 我（AI）可继续代做的工程项（无需你写代码）

在你按上文把 **MySQL + 后端 + 两端** 起起来后，我可按大厂规范继续：

1. **配置加载 harden**（已做：包根 `.env` 多路径）  
2. **联通冒烟脚本**：一键 login → 建组 → 建任务 → 发布 → 断言 MySQL 行数  
3. **模板字段对齐**：你发字段名后改 `buildWxData`  
4. **审计只读页**（admin-web 扩展，软删/关键操作查询）  
5. **接口契约收敛**：以 routes 为准修过时文档  
6. **Git remote / 分支策略说明**（你提供仓库 URL）

---

## 10. 请你现在回我的最小信息（复制填空）

```
1. 后端启动日志是否 mode=mysql？是/否
2. WX_SECRET 是否已写入 backend/.env？是/否（不要发真值）
3. 微信开发者工具能否打开 miniprogram 并登录成功？是/否
4. H5 http://127.0.0.1:5173 能否登录？是/否
5. 若微信下发失败，公众平台两模板的字段列表（thing1/time2…）
```

填完后我可以继续做「一键互通冒烟」或「模板字段对齐 / 审计页」。
