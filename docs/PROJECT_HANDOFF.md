# 项目交接文档

> **生成时间**：2026-07-18  
> **目标**：新 AI 只粘贴本文档，即可无缝接手继续开发  
> **原则**：基于当前仓库与本机事实；不确定处标注「不确定」；密钥不写真实值  
> **项目根目录**：`D:\排班小程序`（Git Bash / 工具中亦写作 `/d/排班小程序`）  
> **配套文档**：UI 专属见 `docs/UI项目完整交接文档.md`；业务圣经见 `docs/business-flows.md`

---

## 1. 项目基本信息

- **项目名称**：排班小程序（工程名 `scheduling-miniprogram` / 产品名「排班协同」「排班小助手」）
- **项目目标**：通用轻量协同排班平台。支持创建/加入分组、发布排班任务、成员标记空闲、服务端生成候选方案、发布查收、异议调整；校内场景支持 **节次 / 时间段 / 节次+时间段** 三种时段模式。
- **解决什么问题**：班组/社团/实验室等场景下，手工对空闲、Excel 排班成本高；需要「发布者建任务 → 成员填空闲 → 生成方案 → 公示 → 异议」闭环，并适配课表节次与值班时间段。
- **当前开发阶段**：**主链路可联调**（非完整上线态）。  
  - 后端：memory/MySQL 双仓储 + 约 41 条 REST 路由 + **单测 35 通过（本机 2026-07-18 已复验）**  
  - 小程序：主路径页面已接 `services/*` API；大量二级页仍为设计稿 mock  
  - H5 运维前端：**基本未建**  
  - 线上部署：**未确认**有生产环境
- **技术栈**：
  - 前端：微信小程序原生（WXML / WXSS / JS，`style: "v2"`）
  - 后端：Node.js ≥18 + Express（另有 CloudBase 云函数入口骨架）
  - 数据库：MySQL 8.x（`mysql2`）+ 内存仓储（`DB_MODE=memory`）
  - 鉴权：自研 JWT HS256（无 `jsonwebtoken` 依赖）
  - 共享常量：`shared/time-constants.json`（前后端语义对齐）
- **运行环境**：
  - OS：Windows 11  
  - 路径：`D:\排班小程序`  
  - 小程序：微信开发者工具，基础库配置约 `3.16.2`  
  - 可选：Docker Desktop 容器 `paiban-mysql`（本机检查时 **Up / healthy**）
- **主要依赖**：
  - 后端：`express`、`mysql2`（见 `backend/package.json`）  
  - 前端：无 npm 构建链（原生小程序，无 `miniprogram_npm` 业务依赖）  
  - 开发期曾用 `miniprogram-automator`，**根目录临时 node_modules 已删除**
- **项目所在目录**：
  ```
  D:\排班小程序\
  ├── miniprogram/     # 微信小程序
  ├── backend/         # Node API
  ├── docs/            # 设计 / 规范 / 交接
  ├── shared/          # 前后端共享 JSON
  ├── .claude/         # skills / 本地 settings
  └── 未命名绘图.drawio  # 用户原始线框原型
  ```
- **当前分支或版本状态**：
  - Git 分支：`master`（另有本地分支 `feat-design-miniprogram-ui-Pcn9qn`）  
  - **主实现已提交**：`3bbf70b`（2026-07-18，226 files：backend + miniprogram + shared + docs + .gitignore）  
  - 根目录已有 `.gitignore`（排除 `.env` / `node_modules` / 私有配置）  
  - **git remote：仍无**（本机未配置远端；未 push）  
  - 不确定：是否另有远端备份
- **是否有线上部署**：以本地联调为主。设计文档提到 CloudBase/云托管，**未落地为现成部署流水线**。体验版/正式版小程序是否已发：**不确定**。
- **是否涉及数据库**：**是**。默认库名 `paiban`，`backend/schema.sql` 含 **16 张表**。另有 `DB_MODE=memory` 无库可跑测。
- **是否涉及第三方 API**：
  - 微信：`code2Session`、订阅消息、支付（模块有，密钥多为空/占位）  
  - 设计中有课表 OCR：**实现多为骨架**，未完整接真 OCR  
- **是否涉及敏感配置或密钥**：**是**。  
  - `backend/.env`：`DB_PASSWORD`、`JWT_SECRET`、`WX_APPID`、`WX_SECRET` 等 → 文档写 **`[REDACTED]`**  
  - `backend/docker-compose.yml` 含本地开发用 MySQL root/应用密码默认值（**仅本地**，勿当生产密钥提交到公开仓）  
  - 小程序 `project.config.json` 含真实 **appid**：`wx32b25e60a3131c4c`  
  - **禁止**把 `.env` 真值贴进聊天或提交到 git（`backend/.gitignore` 已忽略 `.env`）

---

## 2. 当前项目进度

### 模块 A：后端 API 与双仓储

- **状态**：主链路 **已完成** / 支付·OCR·调度 worker **骨架或未验证**
- **相关文件**：
  - `backend/src/server/routes.js`（统一路由表，Express 与云函数共用）
  - `backend/src/server/express.js`、`cloud-function.js`
  - `backend/src/handlers/*`（auth / users / groups / tasks / responses / receipts / preview / notify / payments / scheduleProfiles / guard）
  - `backend/src/repositories/{memory,mysql,index}.js`
  - `backend/src/domain/time/index.js`
  - `backend/src/core/{auth,db,errors,response,validate,context}.js`
  - `backend/src/config.js`
  - `backend/schema.sql`、`backend/seeds/schedule-profiles.seed.json`
  - `backend/tests/*`（35 用例）
- **核心逻辑**：handler 框架无关（`ctx => data`）→ repository 按 `DB_MODE` 切换；发布走乐观锁 `version`；生成方案写 `schedule_jobs` + 候选方案。
- **已验证可用**（已验证）：
  - `cd backend && npm test` → **35 pass / 0 fail**
  - 路由前缀统一 `/api/v1`
  - 内存模式 `npm run dev` 可启动
  - MySQL 模式：本机曾跑通登录/模板/建组/加入/建任务/填报/生成/发布/异议等 B2B 链路（会话记录）
  - 生成方案会同步写候选并置 job `success`（不再只挂 pending）
- **只写了代码未充分验证**：
  - 支付真签回调、真实 `WX_SECRET` 的 code2Session
  - OCR 真链路
  - CloudBase 云函数部署
  - `notify_queue` / `countdowns` / `audit_logs` 业务写入覆盖不全
- **当前问题**：`docs/api-spec.md` 部分路径命名与 `routes.js` 不一致（以实现为准）
- **下一步**：列表/详情字段契约统一、审计中间件、截止调度 worker
- **不要重复尝试**：不要再造第二套路由表；不要把 `generating` 塞进 `tasks.status` 枚举

### 模块 B：时段三模式（节次 / 时间段 / 节次+时间段）

- **状态**：**P0 后端 + domain + 创建任务链路已完成**；展示层部分页面已接
- **相关文件**：
  - `shared/time-constants.json`
  - `backend/src/domain/time/index.js`
  - `backend/seeds/schedule-profiles.seed.json`
  - `backend/src/handlers/scheduleProfiles.js`、`tasks.js`（create 快照 + generate）
  - `miniprogram/constants/time.js`、`constants/schedule-profiles.seed.json`
  - `miniprogram/domain/time.js`、`services/profiles.js`
  - `miniprogram/pages/style-select/*`、`task-create/*`
  - 设计：`docs/superpowers/specs/2026-07-18-campus-time-modes-modular-design.md`
  - 计划：`docs/superpowers/plans/2026-07-18-p0-campus-time-modes.md`（标记 DONE / 35 pass）
- **核心逻辑**：
  - `TIME_MODES`：`section` | `range` | `section_range`（默认 `section_range`）
  - `resolvePeriods(mode, profile, overrides)` 产出任务 **periods 快照**
  - 平台种子模板（如 `sys_uni_45min_v1` 等 5 套）+ 分组可覆盖 profile
- **已验证**：domain 单测；三 mode 建任务快照；默认模板 11 节类种子
- **不要重复尝试**：
  - **禁止**把产品默认模型写回「早班/午班/晚班」硬编码  
  - legacy `morning/afternoon/night` 仅允许在 domain 映射层兼容  
  - 禁止页面内写死 `08:00-08:45` 列表（见 `HARDCODE_POLICY`）

### 模块 C：小程序主链路页面（已接 API）

- **状态**：开发中 / **主路径可用**
- **已 `require('../../services/...')` 的页面**（代码事实）：
  | 页面 | services |
  |------|----------|
  | `pages/index` | groups |
  | `pages/join` | groups |
  | `pages/group-detail` | groups, tasks |
  | `pages/group` | groups, tasks, profiles（旧/并行路径） |
  | `pages/task` | groups, tasks |
  | `pages/task-create` | groups, tasks, profiles |
  | `pages/task-detail` | tasks |
  | `pages/task-mark` | tasks, responses |
- **相关但未直接 require services**：`pages/style-select`（读 `constants/time`，带 `timeMode` 跳转 task-create）
- **核心用户路径**：
  1. 启动 `app.js` 静默登录  
  2. 首页拉我的分组  
  3. 创建分组 / 邀请码加入  
  4. style-select 选 timeMode  
  5. task-create 选模板+日期+约束 → POST 任务（`collecting`）  
  6. task-mark 填报空闲  
  7. task-detail 生成 / 发布 / 取消  
  8. 任务 Tab 聚合列表  
- **已验证可用**：接口级 + 单测充分；**UI 全页人工点检不完全**（不确定）
- **当前问题**：部分页仍混设计稿 mock 字段/弱网文案；`app.globalData.themeColor` 仍写 `#7EC8E3`，与 v4 主色 `#2B6DE5` 不一致（视觉债）
- **下一步**：稳定演示闭环 + 修误导 mock 入口

### 模块 D：小程序二级 / 设计稿页面（大量 mock）

- **状态**：UI 骨架 / **多数未接 API / 未验证**
- **相关页面**（`app.json` 注册但无 services 引用，偏 mock）：  
  `auth`、`schedule`、`profile`、`objection`、`scheme-gen`、`scheme-preview`、`publisher-review`、`joiner-fill`、`members`、`calendar-manage`、`cal-edit-time|period|custom`、`public-result`、`share-preview`、`schedule-receipt`、`schedule-rules`、`member-preset` 等
- **注意**：`task-mark` 与 `joiner-fill` 可能同构（**是否保留双页：不确定**）
- **下一步**：按优先级接线 schedule/profile/objection/share，或隐藏死链避免误导
- **不要重复尝试**：不要假设 `app.json` 里每个页都已接通真数据

### 模块 E：小程序本地 mock 模式

- **状态**：已完成
- **相关文件**：`miniprogram/utils/local-db.js`、`config.js`（`dataMode`）、`request.js`
- **用途**：`dataMode='local'` 时数据进 `wx.storage`，可不启后端
- **限制**：非多端协作、非真 openid
- **当前默认**：`dataMode='api'`，`baseUrl=http://127.0.0.1:3000/api/v1`（已验证配置文件内容）

### 模块 F：H5 运维端

- **状态**：设计有 / 后端少量接口有 / **前端基本未建**
- **已有后端**：`POST /api/v1/auth/h5/login`、分享只读、模板 API、支付差异
- **未完成**：`admin-web`（React+Antd 等）、SSE 大屏、模板可视化编辑
- **不要重复尝试**：不要假设仓库里已有 `admin-web/` 目录

### 模块 G：数据库与 Docker

- **状态**：本地方案 **已完成**
- **相关文件**：`backend/docker-compose.yml`、`schema.sql`、`scripts/db-init.js`、`db-seed-profiles.js`、`wait-mysql.js`、`migrate-time-modes.sql`
- **已验证**：容器名 `paiban-mysql`、库 `paiban`、健康检查；种子模板脚本
- **说明**：用户可接受本机 MySQL；Docker **非架构强制**
- **本机现状**（2026-07-18）：`paiban-mysql` 曾观测为 **Up (healthy)**；`.env` 中 `DB_MODE=mysql`、`DB_NAME=paiban`

### 模块 H：设计图 / 交互规格 / Skills

- **状态**：视觉方向定稿；**全页交互三层规格未写完**
- **相关文件**：
  - `docs/ui-design-phones.drawio`（约 31 页一屏一页）+ `ui-design-phones-open.html`
  - 用户原型：`未命名绘图.drawio`
  - 模板：`docs/templates/publisher-interaction-page-spec.md`、示例 task-detail
  - 已写 specs：`docs/specs/publisher-task-{create,detail}-interaction.md`、`publisher-scheme-{gen,preview}-interaction.md`
  - Skills：`.claude/skills/publisher-interaction-spec`、`weui-miniprogram-ui`
  - 全局样式：`miniprogram/app.wxss` v4
- **强制工作流（发布者后台交互页）**：单角色 publisher + 三层输出（布局 → 共享组件 token → 每按钮 A/B/C 状态机）
- **签名 UI**：Duty Grid（星期 × 节次/时间段），反彩虹 slop

### 模块 I：自动化 / MCP 点击

- **状态**：接口侧可测；UI automator **未跑通**
- **原因**：微信开发者工具服务端口未开 / CLI 路径问题（会话记录）
- **中间测试脚本已删除**（`scripts/b2b-*.js`、`mcp-flow-test.js` 等）
- **保留**：`backend/tests`、`backend/scripts` 运维脚本
- **不要重复尝试**：未开自动化端口时死磕 MCP 点击

### 已放弃 / 勿重复

| 项 | 说明 |
|----|------|
| 全局顶部身份下拉切换 | 改首页分组卡片 |
| `tasks.status=generating` | 改用 `schedule_jobs` |
| `draft` 状态 | MVP 废弃，创建即 `collecting` |
| 早午晚作为产品默认模型 | 改为节次/时间段/组合 + 作息模板 |
| touristappid 联调真登录 | 必须真实 AppID |
| 根目录临时 automator npm | 已清理，勿污染 monorepo 根 |
| 彩虹渐变/多色光斑视觉 | 用户反馈后废弃 |

---

## 3. 文件结构说明

### 3.1 根目录

```
D:\排班小程序\
├── miniprogram/          # 小程序工程（导入微信开发者工具的目录）
├── backend/              # Node 后端
├── docs/                 # 文档与设计图
├── shared/               # 跨端常量
├── .claude/skills/       # publisher-interaction-spec、weui-miniprogram-ui
├── .workbuddy/           # 历史工作记忆（非运行时依赖）
└── 未命名绘图.drawio      # 用户原始 UI 流
```

### 3.2 入口文件

- **`backend/src/server/express.js`**  
  - 作用：本地 HTTP 服务入口  
  - 状态：可用  
  - 注意：`npm start` / `npm run dev` / `dev:mysql` 均指向它

- **`backend/src/server/cloud-function.js`**  
  - 作用：云函数 `main` 入口  
  - 状态：骨架存在，**部署未完整验证**

- **`miniprogram/app.js`**  
  - 作用：启动静默登录、`globalData`、loginReady  
  - 重要：`silentLogin`；设计稿与业务双字段 `currentUser` / `user`  
  - 注意：`themeColor` 与 app.wxss 主色不一致（债）

### 3.3 配置文件

| 文件 | 作用 | 状态 / 注意 |
|------|------|-------------|
| `miniprogram/project.config.json` | 工程、appid、编译 | appid=`wx32b25e60a3131c4c`，`urlCheck:false` |
| `miniprogram/project.private.config.json` | 私有覆盖 | 勿用 touristappid；勿提交密钥 |
| `miniprogram/app.json` | 26+ 页面路由、4 Tab | Tab：首页/日程/任务/我的 |
| `miniprogram/utils/config.js` | dataMode/baseUrl/轮询/订阅模板占位 | 默认 api + `:3000/api/v1` |
| `backend/.env` / `.env.example` | 运行环境 | `.env` 本机存在且 gitignore |
| `backend/docker-compose.yml` | MySQL 8.4 容器 | 端口 3306，库 paiban |
| `backend/schema.sql` | **表结构真相源** | 16 表 |
| `backend/package.json` | npm scripts | Node ≥18 |
| `shared/time-constants.json` | 时段语义真相源之一 | 与前后端 domain 对齐 |
| `.claude/settings.local.json` | Claude 本地权限 | 非业务 |

### 3.4 后端核心业务

| 文件 | 作用 | 最重要符号 | 修改注意 |
|------|------|------------|----------|
| `src/server/routes.js` | 路由表 | `ROUTES`、`match` | **API 契约第一真相** |
| `src/handlers/tasks.js` | 建任务/生成/发布/取消/调整 | create、generate、publish、`buildCandidateSchedules` | 生成引擎为简易轮询取人 |
| `src/handlers/groups.js` | 分组 CRUD/加入/踢人 | create、join、kick | 软删成员 |
| `src/handlers/responses.js` | 空闲填报 | submit、getMine | 字段名曾统一过 |
| `src/handlers/scheduleProfiles.js` | 模板与分组作息 | listProfiles、putGroupProfile | 与 seeds 联动 |
| `src/handlers/guard.js` | 鉴权与角色 | requireAuth 等 | 发布者/成员边界 |
| `src/domain/time/index.js` | 时段解析 | `resolvePeriods`、`TIME_MODE_META` | 禁止页面散落 mode 分支 |
| `src/repositories/memory.js` | 内存仓储 | 全资源 | 测试默认 |
| `src/repositories/mysql.js` | MySQL 仓储 | 事务 publish 等 | 参数顺序曾踩坑 |
| `src/repositories/index.js` | 切换仓储 | `getRepos` | mysql 启动灌种子 |
| `src/core/auth.js` | JWT/wx/H5 | sign/verify | 无第三方 jwt 库 |
| `src/core/db.js` | 连接池 | 仅 mysql 模式 | lazy require |
| `src/core/errors.js` | 业务错误码 | ApiError | 与 API.md 对齐 |
| `src/core/response.js` | 统一包络 | code/data/message | 前端按 code===0 |

### 3.5 API 路由文件

- **唯一路由定义**：`backend/src/server/routes.js`  
- **文档**：`backend/API.md`、`backend/openapi.yaml`（实现向）  
- **设计规范**：`docs/api-spec.md`（可能落后，次优先级）

**完整路由清单（实现）**：

```
POST   /api/v1/auth/miniprogram/login
POST   /api/v1/auth/h5/login
POST   /api/v1/auth/refresh
GET    /api/v1/meta/time-constants
GET    /api/v1/schedule-profiles
GET    /api/v1/schedule-profiles/:profileId
GET    /api/v1/groups/:groupId/schedule-profile
PUT    /api/v1/groups/:groupId/schedule-profile
POST   /api/v1/groups/:groupId/schedule-profile/import
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/me/calendar
PUT    /api/v1/users/me/calendar
POST   /api/v1/users/me/calendar/ocr
GET    /api/v1/users/me/assignments
POST   /api/v1/groups
GET    /api/v1/groups
POST   /api/v1/groups/join
GET    /api/v1/groups/:groupId
GET    /api/v1/groups/:groupId/members
DELETE /api/v1/groups/:groupId/members/:userId
POST   /api/v1/groups/:groupId/members/leave
POST   /api/v1/groups/:groupId/tasks
GET    /api/v1/groups/:groupId/tasks
GET    /api/v1/tasks/:taskId
POST   /api/v1/tasks/:taskId/scheme-jobs
GET    /api/v1/jobs/:jobId
POST   /api/v1/tasks/:taskId/publish
POST   /api/v1/tasks/:taskId/deadline/extend
POST   /api/v1/tasks/:taskId/cancel
POST   /api/v1/tasks/:taskId/adjust
PUT    /api/v1/tasks/:taskId/responses/me
GET    /api/v1/tasks/:taskId/responses/me
POST   /api/v1/tasks/:taskId/receipts/me/objection
GET    /api/v1/tasks/:taskId/receipts/me
GET    /api/v1/share/tasks/:taskId          # 公开只读
POST   /api/v1/notify/subscribe
GET    /api/v1/users/me/inbox
PATCH  /api/v1/users/me/inbox/:messageId
POST   /api/v1/payments/orders
POST   /api/v1/payments/notify
GET    /api/v1/payments/orders/:orderId
```

### 3.6 数据库相关

| 资源 | 作用 |
|------|------|
| `schema.sql` | 建库 `paiban` + 16 表 |
| `seeds/schedule-profiles.seed.json` | 系统作息模板 |
| `scripts/db-init.js` | 初始化 |
| `scripts/db-seed-profiles.js` | 灌模板 |
| `scripts/wait-mysql.js` | 等容器就绪 |
| `scripts/migrate-time-modes.sql` | 旧库增量 |
| `scripts/seed-init.sql` | compose 首次挂载种子 |

**16 表**：`users`、`groups`、`group_members`、`tasks`、`personal_calendars`、`task_responses`、`task_receipts`、`notify_inbox`、`schedule_jobs`、`payments_orders`、`schedule_profiles`、`app_settings`、`user_assignments`、`countdowns`、`notify_queue`、`audit_logs`

**tasks 关键字段**：`time_mode`、`schedule_profile_id`、`schedule_profile_version`、periods 快照类 JSON、`version` 乐观锁

### 3.7 小程序页面 / 组件 / 工具

**组件**：

- `components/group-card`：分组卡片  
- `components/task-card`：任务卡片  
- `components/schedule-view`：班表/网格视图（Duty Grid 方向）

**services（API 解包）**：`auth`、`groups`、`tasks`、`responses`、`profiles`、`receipts`、`notify`、`payments`

**utils**：

| 文件 | 作用 | 注意 |
|------|------|------|
| `request.js` | wx.request + local 分流 | 鉴权头、错误码 |
| `auth.js` | token / silentLogin / ensureLogin | 与 app.js 协作 |
| `local-db.js` | 本地 mock 数据层 | ~430 行 |
| `store.js` | 轻量事件与用户状态 | |
| `format.js` | 展示格式化 | |
| `config.js` | 运行配置 | 见上 |

**domain / constants**：时段工具与种子镜像，须与 `shared/`、后端 domain 保持一致。

### 3.8 测试文件

```
backend/tests/
├── helpers.js
├── auth.test.js
├── groups.test.js
├── tasks.test.js
├── flow.test.js          # 端到端逻辑链
├── payments.test.js
├── schedule-profiles.test.js
└── time-domain.test.js
```

运行：`cd backend && npm test`（**已验证 35 pass**）

### 3.9 文档与部署

| 文档 | 作用 |
|------|------|
| `docs/business-flows.md` | 业务流 v3.x 圣经 |
| `docs/user-scenarios.md` | 13 用户场景 |
| `docs/api-spec.md` | 接口设计（可能落后） |
| `docs/implementation-plan.md` | 工程落地 |
| `docs/logic-layers-design.md` | 逻辑分层 |
| `docs/logic-data-chain-optimization.md` | 数据链/按钮规范 |
| `docs/UI项目完整交接文档.md` | UI 专属交接 |
| `docs/PROJECT_HANDOFF.md` | **本文** |
| `backend/docs/wechat-config.md` | 微信配置说明 |

部署：无完整 CI/CD；本地 `node` + 可选 Docker；云函数入口未完整验收。

---

## 4. 核心逻辑说明

### 4.1 请求从哪里进入？

1. **小程序页面事件** → `services/*` → `utils/request.js`  
   - `dataMode=api`：`wx.request` → `http://127.0.0.1:3000/api/v1/...`  
   - `dataMode=local`：`local-db.handle`  
2. **后端** `express.js` 收包 → `routes.match(method, path)` → `handlers.*` → `getRepos()` → memory 或 MySQL  
3. **H5 运维（设计）**：账号密码 `/auth/h5/login`（前端未完成）  
4. **分享公开**：`GET /share/tasks/:taskId?token=` 只读脱敏

### 4.2 数据经过哪些步骤？（主业务通俗版）

1. 用户打开小程序 → 静默登录拿 JWT（无真密钥时开发态可假 openid）  
2. 创建分组（自己变 publisher）或邀请码加入（member）  
3. 发布者选 **timeMode + schedule profile + 日期范围/约束** → 创建任务  
   - 状态直接 **`collecting`**（无 draft）  
   - **periods 写入任务快照**（以后改模板不影响历史任务）  
4. 成员在日期×时段网格标记空闲 → `PUT .../responses/me`  
5. 发布者触发生成 → `POST .../scheme-jobs`  
   - 写 `schedule_jobs`  
   - **同步**跑简易分配引擎 → `candidate_schedules`  
   - job 状态 **`success`**（当前实现，非异步 worker）  
6. 发布 → `published` + `share_token` + `user_assignments` + 站内消息  
7. 成员异议 / 发布者调整、延长截止、取消  

### 4.3 哪些函数负责关键逻辑？

| 函数 / 模块 | 位置 | 职责 |
|-------------|------|------|
| `resolvePeriods` | domain/time | 三 mode → 最终 periods |
| `tasks.create` | handlers/tasks | 建任务 + 快照 |
| generate / `buildCandidateSchedules` | handlers/tasks | 候选方案 |
| `tasks.publish` | handlers/tasks | 发布（含候选兜底） |
| `request` | miniprogram/utils/request | 网络/本地分流 |
| `silentLogin` / `ensureLogin` | miniprogram/utils/auth | 登录态 |
| `getRepos` | repositories/index | memory/mysql 切换 |

### 4.4 哪些地方容易出 bug？

1. **touristappid** → 真登录失败  
2. **BASE_URL 前缀** 历史曾 `/miniapp/v1` vs `/api/v1` → 现统一 `/api/v1`  
3. **MySQL `updateWithVersion` 参数顺序** id/version 写反（已修）  
4. **生成 job 一直 pending**（已改同步 success）  
5. **设计文档路径 ≠ routes.js** → 404  
6. **mock 页当真 API 页** → 联调误判  
7. **页面写死早午晚/钟点** → 与 P0 产品冲突  
8. **双份用户字段** `user` / `currentUser` 不同步  
9. **乐观锁冲突** code 类错误未处理导致“点了没反应”

### 4.5 哪些逻辑已经改过？

- 时段三模式 + 模板种子 + 任务快照  
- 主链路页面接 API  
- local mock `dataMode`  
- schema 时间字段与 Docker 联调  
- 生成方案同步落库 + 列表 progress 字段  
- 清理中间测试脚本  

### 4.6 临时方案 / 技术债

- 生成引擎 = 简易轮询取人，**不是**约束求解器  
- 热力图/提交人数聚合 API 弱  
- H5 运维未建  
- 支付 / OCR / 订阅模板 ID 占位  
- **Git 大量未提交 + 无 remote**  
- profile/schedule 等 Tab 页未接 API  
- 设计文档与实现双份真相  
- success 色：代码 `#6BC785` vs WeUI skill `#07C160` 双轨  
- `app.js` themeColor 旧值  

### 4.7 为什么这样写？

- **双仓储**：无 DB 可测可演示；有 DB 可持久  
- **periods 快照**：历史任务不被改模板污染  
- **job 表承载计算态**：避免 tasks 状态机膨胀  
- **local mock**：满足“可不启后端做 UI”  
- **软删除成员**：可审计、可重入  
- **统一 routes 表**：Express 与云函数行为一致  

---

## 5. 环境变量与配置

### 5.1 后端 `backend/.env`（对照 `.env.example`）

| 变量 | 用途 | 必填 | 缺失后果 |
|------|------|------|----------|
| `NODE_ENV` | development/staging/production | 否 | 按 development |
| `DB_MODE` | `memory` \| `mysql` | 否（默认 memory 类脚本） | 不设则内存；设 mysql 则强依赖库 |
| `DB_HOST` | MySQL 主机 | mysql 时是 | 连库失败 |
| `DB_PORT` | 端口 | 否（3306） | 同上 |
| `DB_USER` | 用户 | mysql 时是 | 同上 |
| `DB_PASSWORD` | 密码 | mysql 时是 | 同上；文档 **`[REDACTED]`** |
| `DB_NAME` | 库名 | mysql 时是 | 本机常用 **`paiban`** |
| `DB_POOL_LIMIT` | 连接池 | 否 | 默认 |
| `DB_CONNECT_TIMEOUT` | 连接超时 | 否 | 默认 |
| `DB_CHARSET` | 字符集 | 否 | utf8mb4 |
| `DB_TIMEZONE` | 时区 | 否 | +00:00 |
| `PORT` | Express 端口 | 否 | 默认 3000 |
| `JWT_SECRET` | JWT 密钥 | 生产是 | 开发有弱默认（不安全） |
| `JWT_ACCESS_EXPIRE` | access 有效期 | 否 | 如 2h |
| `JWT_REFRESH_EXPIRE` | refresh 有效期 | 否 | 如 14d |
| `WX_APPID` | 小程序 AppID | 真登录是 | 开发可假 openid |
| `WX_SECRET` | 小程序密钥 | 真登录是 | 同上；**`[REDACTED]`** |
| `WX_MCH_ID` / `WX_MCH_KEY` / `WX_PAY_NOTIFY_URL` | 支付 | 支付功能是 | 支付不可用 |
| `H5_ADMIN_USER` / `H5_ADMIN_PASS` | H5 运维账号 | 用 H5 时是 | 无法 H5 登录 |
| `CORS_ORIGINS` | CORS | 否 | * |
| `RATE_LIMIT_MAX` | 限流 | 否 | |
| `SHARE_TOKEN_TTL` | 分享 token 秒 | 否 | 默认 7 天量级 |
| `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` | 分页 | 否 | |
| `REQUEST_TIMEOUT_MS` | 请求超时 | 否 | |

**本机 `.env` 观测（无密钥）**：`NODE_ENV=development`，`DB_MODE=mysql`，`DB_NAME=paiban`，`PORT=3000`。

### 5.2 小程序配置

- 文件：`miniprogram/utils/config.js`（**无** `.env`）  
- `env`：`dev` | staging | prod 预设 baseUrl  
- `dataMode`：`api` | `local`  
- `subscribeTemplateIds`：占位字符串  
- `jobPollIntervalMs=1000`，`jobPollMaxTimes=30`  
- `project.config.json`：`appid`

### 5.3 Docker Compose 配置

- 镜像：`mysql:8.4`  
- 容器：`paiban-mysql`  
- 库：`paiban`  
- 首次启动挂载 `schema.sql` + `seed-init.sql`  
- 密码：见 compose 文件本地默认值 → 交接文中 **`[REDACTED]`**，勿抄进生产  

### 5.4 检查结果

- 存在：`.env.example`、`.env`（本地）、`config.js`、docker-compose、schema、openapi  
- 不存在：完整 K8s/Terraform/生产域名清单（**不确定**是否外置）

---

## 6. 启动、运行、测试方式

### 6.1 安装依赖

```bash
cd D:\排班小程序\backend
npm install
```

（小程序无 npm 业务依赖。）

### 6.2 后端 — 内存模式（已验证路径）

```bash
cd D:\排班小程序\backend
npm run dev
# 期望：listening on :3000 (mode=memory)
```

**状态：已验证**（脚本与 README 一致；单测同模式 35 pass）。

### 6.3 后端 — MySQL 模式

```bash
cd D:\排班小程序\backend
docker compose up -d
# 编辑 .env：DB_MODE=mysql，DB_* 与 compose/本机一致
node scripts/wait-mysql.js
node scripts/db-init.js          # 若非 compose 首次自动灌表
node scripts/db-seed-profiles.js
npm run dev:mysql
# 期望：listening on :3000 (mode=mysql)
```

或一键：`npm run db:reset`（会 `down -v` 清卷，**慎用**）。

**状态**：Docker 健康与脚本存在 **已验证**；完整 B2B 手测为会话历史结论。

### 6.4 测试

```bash
cd D:\排班小程序\backend
npm test
# 期望：tests 35, pass 35, fail 0
```

**状态：已验证（2026-07-18 本机复跑）。**

### 6.5 小程序

1. 微信开发者工具 → 导入 **`D:\排班小程序\miniprogram`**（不要只开根目录）  
2. 使用真实 AppID（配置中为 `wx32b25e60a3131c4c`）  
3. 详情 → **不校验合法域名**（本地 HTTP）  
4. 确认 `utils/config.js`：`dataMode='api'`，`baseUrl` 指向后端  
5. 编译；先保证后端已 `listening`  

纯 UI：`dataMode='local'`。

### 6.6 数据库启动

- Docker：`backend` 下 `docker compose up -d`  
- 本机 MySQL：建库 `paiban` 后执行 `schema.sql` + seed  
- **常见失败**：3306 被占/未监听、密码错、`DB_MODE=mysql` 但容器已 down、字符集非 utf8mb4  

### 6.7 构建与部署

- **构建**：无前端 webpack；后端无 transpile，直接 node  
- **部署**：  
  - 本地/容器：`DB_MODE=mysql node src/server/express.js`  
  - 云函数：`cloud-function.js` 的 `main`（**未完整验证**）  
- **无**标准 CI 配置  

### 6.8 成功标志

- 后端日志含 `listening on :3000`  
- `POST /api/v1/auth/miniprogram/login` → `code:0` + token  
- MySQL 下 `schedule_profiles` 有种子行（约 5）  
- 小程序能：建组 → 三 mode 建任务 → 填报 → 生成 → 发布  
- `npm test` 35 pass  

### 6.9 常见启动失败

| 现象 | 排查 |
|------|------|
| ECONNREFUSED 3000 | 后端未启 |
| mysql 连接失败 | DB_MODE/密码/容器 |
| 小程序 login 失败 | appid/游客模式/后端未启 |
| 404 API | 是否多写了前缀或文档旧路径 |
| 合法域名错误 | urlCheck 与 HTTPS 域名 |

---

## 7. 已知问题与坑

### 问题 1：touristappid / 游客 AppID

- **表现**：登录、code2Session 失败  
- **可能原因**：工程使用游客占位 appid  
- **已尝试 / 有效方案**：换成真实 AppID；后端配 `WX_APPID`/`WX_SECRET`  
- **无效方案**：指望游客模式跑通正式登录  
- **相关文件**：`project.config.json`、`project.private.config.json`  
- **新 AI 下一步**：先读两个 json 的 appid 字段  

### 问题 2：设计文档与实现路由不一致

- **表现**：按 `docs/api-spec.md` 调用 404  
- **可能原因**：规范名与 `routes.js` 不同（如历史 wechat-login 命名）  
- **有效方案**：以 `routes.js` + `backend/API.md` 为准  
- **无效方案**：只改文档不改调用方或反向  
- **相关文件**：`routes.js`、`api-spec.md`、`API.md`  
- **下一步**：收敛文档或加别名路由  

### 问题 3：大量页面仍是 mock

- **表现**：UI 很全但点了不进真数据  
- **可能原因**：设计稿页未接 `services/*`  
- **有效方案**：只从已接 API 的主页面验收主链路  
- **相关文件**：`pages/*`、`services/*`  
- **下一步**：接线或下线死页  

### 问题 4：H5 运维前端缺失

- **表现**：无 admin-web  
- **原因**：只做到后端能力与设计  
- **下一步**：新建工程接 `/auth/h5/login` 与 templates  

### 问题 5：微信开发者工具自动化端口

- **表现**：automator/MCP 点不到模拟器  
- **原因**：服务端口未开 / CLI 非完整 IDE  
- **有效方案**：工具内开启服务端口  
- **无效方案**：未开端口死循环重试  
- **下一步**：用户本地开端口后再 UI 回归  

### 问题 6：生成方案曾只返回 pending

- **表现**：前端轮询不到结果  
- **有效方案**：handler 内同步生成并落库 success（**已修**）  
- **相关文件**：`handlers/tasks.js`  
- **下一步**：生产可再拆 worker  

### 问题 7：Git 未提交 + 无 remote

- **表现**：新环境若只拉历史 commit 会缺失几乎全部实现  
- **可能原因**：开发全程未 commit 大目录  
- **下一步**：整理 `.gitignore`，提交 backend/miniprogram/shared/docs；配置 remote  
- **注意**：勿提交 `.env`

### 问题 7b：schema.sql 导入临时库时表落到 `paiban`（已修）

- **表现**：`node scripts/db-smoke.js` 报 `Table 'paiban_smoke_xxx.users' doesn't exist`，日志却先打印「导入完成」  
- **根因**：`schema.sql` 内含 `CREATE DATABASE paiban` + `USE paiban`，在已 `USE` 临时库后仍把表建到 `paiban`  
- **有效方案**：`scripts/lib/schema-sql.js` 的 `stripDatabaseSwitch`；`db-smoke.js` / `import-schema.js` 导入前剥离  
- **验证**：`node scripts/db-smoke.js` → 16 表 + 断言通过（2026-07-18）  

### 问题 8：支付 / OCR / 订阅模板

- **表现**：占位 ID、空密钥  
- **相关文件**：`config.js` subscribeTemplateIds、`payments.js`、`wechat-config.md`  
- **下一步**：按微信后台配真值  

### 问题 9：Token / 成功色双轨

- **表现**：skill 文档与 `app.wxss` success/warning/danger 不一致  
- **有效方案**：实现以 **`app.wxss` 为准**；改微信绿需产品确认  
- **相关文件**：`app.wxss`、weui skill  

### 问题 10：权限与角色

- **表现**：成员调用发布/生成失败  
- **可能原因**：guard 校验 `role_in_group`  
- **下一步**：查 `group_members` 与 guard 错误码  

### 已修好的坑（摘要）

- BASE_URL 前缀错误  
- updateWithVersion 参数顺序  
- 登录回包缺 user  
- 填报/异议字段名不统一  
- 早午晚默认模型  
- 生成 job 永久 pending  
- schema.sql 硬编码 USE 导致 smoke 空库（stripDatabaseSwitch）  
- app.js themeColor 与 v4 主色不一致 → `#2B6DE5`  
- task-detail `canMark` 误锁发布者本人  
- profile / join 管理列表 / schedule 假数据误导（已接 API 或空态）  

---

## 8. 最近修改记录

### 修改 1：时段三模式 + 作息种子

- **修改原因**：校内需要节次/时间段/组合  
- **改了什么**：domain/time、seeds、scheduleProfiles、task-create、shared constants、superpowers 设计文档  
- **为什么这么改**：避免早午晚硬编码；任务快照保证历史稳定  
- **是否验证**：是（单测 35 + 建任务）  
- **可能影响**：创建任务契约增加 `timeMode`/profile 字段  

### 修改 2：主链路页面接 API

- **修改原因**：从纯 mock 走向可联调  
- **改了什么**：index/join/group-detail/group/task/task-create/task-detail/task-mark  
- **是否验证**：接口级充分；UI 全量点检不完全  
- **可能影响**：依赖后端或 local mock  

### 修改 3：local mock 模式

- **修改原因**：可不启后端/不用 Docker 做 UI  
- **改了什么**：`local-db.js`、`request.js`、`dataMode`  
- **是否验证**：local-db 冒烟（会话结论）  
- **可能影响**：切换 dataMode 行为分叉  

### 修改 4：MySQL schema 与 Docker 联调

- **修改原因**：B2B 数据库互通  
- **改了什么**：schema.sql、docker-compose、db 脚本、mysql.js  
- **是否验证**：是  
- **可能影响**：`DB_MODE=mysql` 强依赖 3306  

### 修改 5：生成方案同步落库 + 列表进度

- **修改原因**：联调与任务 Tab  
- **改了什么**：handlers/tasks.js、list 聚合字段  
- **是否验证**：是  
- **可能影响**：generate 立即 success；列表带 responseCount/memberCount  

### 修改 6：清理中间测试脚本

- **修改原因**：用户要求删除中间测试文件  
- **改了什么**：删除根 scripts 临时文件与临时 node_modules  
- **是否验证**：正式 `npm test` 仍 35 pass  
- **可能影响**：勿再依赖已删 b2b 脚本  

### 修改 7：UI 设计图与交互规格基建

- **修改原因**：发布者页要可测状态机 + 视觉定稿  
- **改了什么**：drawio 31 页、publisher-interaction-spec skill、templates、部分 specs、app.wxss v4  
- **是否验证**：设计方向用户反馈收敛；全页规格未完成  
- **可能影响**：后续 UI 任务必须走三层规格  

### 用户确认过的需求（会话内）

- 不要早午晚默认，要节次/时间段/组合  
- 双层作息（平台模板 + 分组覆盖）  
- 可先 P0 落地  
- 可不用 Docker；可不用后端做本地  
- 要 B2B 接口 + MySQL 互通直到成功  
- 最后删中间测试文件  
- 要超详细交接文档  
- 发布者交互页强制三层状态机输出  
- 视觉：Duty Grid + 反 slop + 主色 `#2B6DE5`  

### 废弃方案

- touristappid 正式联调  
- 仅前端写死模板钟点  
- `tasks.status=generating`  
- 彩虹运营风 UI  
- 全局身份下拉切换  

---

## 9. 下一步开发计划

### 下一步最优先做什么？

- **目标**：把「任务 Tab + 详情 + 填报 + 发布」做成 **稳定可演示的最小闭环**，并 **把实现提交进 Git**  
- **原因**：API 与单测已通，但页面完成度、mock 误导、仓库未提交会直接阻断交接与回滚  
- **涉及文件**：  
  `pages/task/*`、`task-detail/*`、`task-mark/*`、`profile/*`、`schedule/*`、  
  `backend/`、`miniprogram/`、`shared/`、根/backend `.gitignore`  
- **具体步骤**：
  1. `npm test` 确认 35 pass；启动 `dev` 或 `dev:mysql`  
  2. 微信开发者工具走通：建组 → style-select 三 mode 建任务 → 第二身份加入填报 → 生成 → 发布  
  3. 修/隐藏 profile、schedule 上会误导的 mock 入口  
  4. 补根目录 `.gitignore`（node_modules、.env、私有配置）  
  5. 首次大提交：backend + miniprogram + shared + docs  
- **验收标准**：
  - 双角色路径无 500  
  - 任务列表 progress 与 responses 一致  
  - 新机器按本文档可启动（即使尚无 remote，至少工作区完整可复制）  

### 第二优先级

- **目标**：H5 运维最小可用（登录 + 模板列表/编辑 + 审计只读）  
- **原因**：双层作息的平台侧需要运营入口  
- **具体步骤**：
  1. 新建 `admin-web`（建议 React + Antd）  
  2. 接 `/auth/h5/login`、`/schedule-profiles`  
  3. 默认 timeMode / profile 设置页  

### 第三优先级

- **目标**：截止调度 worker + 真实订阅消息模板 + 分享 H5 预览完善  
- **原因**：通知与增长闭环  
- **具体步骤**：
  1. 扫描 `countdowns` / deadline  
  2. 配置真实订阅模板 ID  
  3. 校验 share token 过期与脱敏字段  

### 哪些任务不要现在做？

- 重写整套状态机（已有 v3.x 文档）  
- 上复杂排班求解器 / OR-Tools  
- 未开自动化端口时死磕 MCP UI 自动化  
- 同时大重构全部 26+ 页面  
- 把 Docker 写成唯一数据库方式  
- 提交 `.env` 或生产密钥  
- 再引入早午晚产品模型  
- 为每个 mock 页先写像素动画  

### 哪些功能容易过度开发？

- 完美约束求解与多目标优化  
- 完整 OCR 课表识别产品化  
- 支付完整商用闭环（MVP 可后置）  
- 31 页全部高保真 + 全按钮状态机一次做完  
- 自研组件库替代 WeUI/TDesign 全量封装  
- 多租户/组织架构/复杂权限矩阵超 MVP  

---

## 10. 给新 AI 的快速上手清单

```bash
# 1) 单测（应 35 pass）— 已验证
cd D:\排班小程序\backend
npm install
npm test

# 2) 内存 API
npm run dev

# 3) 或 MySQL
docker compose up -d
# .env: DB_MODE=mysql, DB_NAME=paiban
node scripts/wait-mysql.js && node scripts/db-init.js && node scripts/db-seed-profiles.js
npm run dev:mysql

# 4) 小程序
# 微信开发者工具打开 D:\排班小程序\miniprogram
# config.js: dataMode='api', baseUrl → :3000/api/v1
```

**契约优先级**：`routes.js` > `backend/API.md` > `docs/api-spec.md`  
**业务规则优先级**：`business-flows.md` + 时段 specs > 口头假设  
**数据模式**：任务 `periods` 是快照；改模板不回写历史任务  
**UI 交互页**：按 `publisher-interaction-spec` 三层输出  
**视觉 token**：以 `miniprogram/app.wxss` 为准  

**UI 专档**：`docs/UI项目完整交接文档.md`  
**会话记忆索引**（Claude）：`~/.claude/projects/D-------/memory/MEMORY.md`

---

## 11. 不确定项汇总

- 生产部署域名、CloudBase 环境 ID、是否已有线上用户  
- `WX_SECRET` 是否已在真实环境可用  
- Git 远端与团队协作流程（本机无 remote）  
- H5 是否已有独立仓库  
- 二级 mock 页最终保留还是删除  
- `task-mark` 与 `joiner-fill` 是否长期双轨  
- 全页 UI 与 drawio 像素对齐完成度（需逐页对照）  
- 本机 Docker 容器是否长期保持 healthy（会随关机变化）  

---

**文档结束。**  
新 AI 接手后建议顺序：`npm test` → 启后端 → 微信工具走通建组建任务主路径 → 再改功能或补提交。
