# 项目交接文档（唯一正式版）

> **生成/更新**：2026-07-18  
> **目标**：新 AI 只粘贴本文档即可接手；操作细节见 `docs/LOCAL_FULL_STACK_RUNBOOK.md`  
> **原则**：仓库事实为准；不确定标「不确定」；密钥不写真值  
> **根目录**：`D:\排班小程序`

---

## 1. 项目基本信息

| 项 | 内容 |
|----|------|
| 名称 | 排班小程序 / 排班协同（`scheduling-miniprogram`） |
| 目标 | 建组→建任务→填空闲→生成→发布→异议；校内 **节次/时间段/节次+时间段** |
| 阶段 | **主链路可联调 + H5 运维 MVP + 通知双轨 + 全链路 smoke 已通** |
| 技术栈 | 微信小程序原生；Node≥18 Express；MySQL8（`mysql2`）+ memory 仓储；自研 JWT HS256 |
| 目录 | `miniprogram/` · `backend/` · `admin-web/` · `shared/` · `docs/` |
| Git | 分支 `master`；近期关键提交见文末；**无 remote（不确定是否有外部备份）** |
| 线上 | 以本地联调为主；生产域名/CloudBase **未落地流水线** |
| 数据库 | **是**，默认库 **`paiban`**（约 15 表，无支付表） |
| 支付 | **否**（已移除） |
| 第三方 | 微信登录/订阅消息；OCR 骨架 |
| 密钥 | `backend/.env`（gitignore）；模板 ID 已配置；`WX_SECRET` 由本机维护 |

---

## 2. 当前进度（模块）

### A. 后端 API + 双仓储 — **已完成**
- 路由：`backend/src/server/routes.js`（`/api/v1`）
- 仓储：memory / mysql；domain 时段 + countdown
- 单测：`npm test` → **43+ pass**（以本机最新为准）
- 冒烟：`npm run smoke`（memory 或 mysql 环境）→ **MySQL 全链路已验证 PASS**

### B. 时段三模式 — **已完成**
- `shared/time-constants.json`、`domain/time`、`schedule_profiles` 种子
- 禁止早午晚硬编码产品默认

### C. 小程序主链路 — **主路径已接 API**
- 已接 services：index / join / group-detail / group / task / task-create / task-detail / task-mark / schedule / profile（消息）/ share-preview
- 二级页仍有 UI 骨架；**主入口已避免跳 mock 死页**（joiner-fill / scheme-gen 从主路径收敛）

### D. 通知 — **已完成（双轨）**
- 站内 `notify_inbox` 必达
- 微信订阅：模板  
  - 排班加入：`mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg`  
  - 未提交日志：`JQYOa6W-Fq1qZBSvJVD3vVRxfm2iQ2IaYQs-ex5DYic`  
- 服务端下发：`core/wechat-subscribe.js` + `services/notify-dispatch.js`
- 截止 worker：`npm run worker:deadline`

### E. H5 运维 — **MVP 已完成**
- `admin-web/`（Vite）：登录、默认 timeMode/profile、模板列表、订阅状态、**审计只读**
- API：`/auth/h5/login`、`/admin/overview|settings|audit-logs`

### F. 分享预览 — **已完成**
- token 过期、`share_token_expires_at`、姓名脱敏

### G. 支付 — **已废弃删除**

---

## 3. 文件结构（关键）

```
D:\排班小程序\
├── miniprogram/          # 微信小程序（开发者工具导入此目录）
├── backend/              # Node API
│   ├── src/server/routes.js
│   ├── src/handlers/*
│   ├── src/repositories/{memory,mysql}.js
│   ├── src/domain/{time,countdown}.js
│   ├── src/workers/deadline-worker.js
│   ├── src/services/notify-dispatch.js
│   ├── scripts/full-stack-smoke.js
│   ├── schema.sql
│   └── .env              # 本地密钥，勿提交
├── admin-web/            # H5 运维
├── shared/time-constants.json
└── docs/
    ├── PROJECT_HANDOFF.md          # 本文（唯一正式交接）
    └── LOCAL_FULL_STACK_RUNBOOK.md # 互通操作手册
```

**契约优先级**：`routes.js` > 单测/smoke > `API.md` > 旧设计文档  

---

## 4. 核心运行流程

1. 小程序静默登录 → JWT  
2. 建组 / 邀请码加入（审计 `group.create`；通知 group_joined）  
3. 选 timeMode + profile → 建任务（periods **快照**；写 countdowns）  
4. 成员填报 `PUT .../responses/me`  
5. 生成方案 → `schedule_jobs` + candidate  
6. 发布 → assignments + share_token + inbox + 微信尽力推送 + 审计 `task.publish`  
7. worker 扫截止 → reviewing + 提醒  
8. H5 改 `app_settings` 默认 timeMode/profile → 影响后续新建任务  

---

## 5. 环境变量（摘要）

| 变量 | 用途 |
|------|------|
| `DB_MODE` | `mysql` / `memory` |
| `DB_*` | MySQL 连接；库名 **`paiban`** |
| `JWT_SECRET` | 签发 |
| `H5_ADMIN_USER/PASS` | 运维登录 |
| `WX_APPID/SECRET` | 真登录 + 订阅下发 |
| `WX_TMPL_*` | 订阅模板 |
| `WX_MINI_STATE` | developer/trial/formal |
| `DEADLINE_REMIND_HOURS` | 截止前提醒 |

小程序：`utils/config.js` → `dataMode=api`，`baseUrl=http://127.0.0.1:3000/api/v1`  

---

## 6. 启动 / 测试 / 部署

```bash
# DB
cd backend && docker compose up -d
node scripts/wait-mysql.js && node scripts/db-init.js && node scripts/db-seed-profiles.js

# API
npm test
npm run smoke          # 全链路冒烟（当前 .env 为 mysql 时打真库）
npm run dev:mysql

# H5
cd ../admin-web && npm i && npm run dev   # :5173

# 小程序
# 开发者工具打开 miniprogram/

# 截止
cd ../backend && npm run worker:deadline
```

成功标志：smoke 打印 `FULL STACK SMOKE PASSED`；后端 `mode=mysql`；H5 与小程序数据同库。

---

## 7. 已知问题与坑

1. **touristappid** → 必须真 AppID  
2. **DB_MODE=memory** → 重启丢数据；互通必须 mysql  
3. **share_token_expires_at** 旧库需执行 `scripts/migrate-share-token-expires.sql`  
4. **微信字段** 与公共模板不完全一致时下发失败 → 用 `extra.wxData` 或改 `buildWxData`  
5. **一次性订阅** 1 次授权 ≈ 1 条  
6. **二级 mock 页** 仍在 app.json，勿从主路径当生产入口  
7. **无 git remote**  
8. 配置已改为 **包根加载 .env**（`src/config.js`），勿依赖 cwd  

---

## 8. 最近重要修改

| 主题 | 提交线索 |
|------|----------|
| 主实现入库 | `3bbf70b` |
| 去支付 | `165fb60` |
| 截止/分享/订阅 | `15335a7` 等 |
| 模板 ID | `99eae33` |
| 微信下发 | `f389507` |
| H5 运维 MVP | `54f1cfb` |
| 包根 .env + 手册 | `d8c7476` |
| 审计 + smoke + mock 收敛 + 本文 | 本批 |

用户确认（2026-07-18）：mysql 互通、WX_SECRET 已配、小程序可登录建组、H5 可登录、要打通微信服务通知、第六大项全做。

---

## 9. 下一步（剩余增强，非阻塞互通）

1. 按公众平台**真实字段**精调 `buildWxData`（有 errcode 再改）  
2. 更多二级页接 API 或下线  
3. 模板可视化编辑、SSE 大屏  
4. 配置 git remote / 生产 HTTPS 域名  
5. 定时任务托管 worker（系统计划任务）  

**不要做**：恢复支付、早午晚默认、重写状态机、复杂求解器。

---

## 10. 快速上手

见 **`docs/LOCAL_FULL_STACK_RUNBOOK.md`**。  

最短命令：

```bash
cd D:\排班小程序\backend && npm run smoke && npm run dev:mysql
cd D:\排班小程序\admin-web && npm run dev
# 微信开发者工具 → miniprogram/
```

---

## 11. 不确定项

- 生产域名、CloudBase 环境、是否已发体验版  
- Git 远端  
- 公众平台模板字段是否与 `buildWxData` 完全一致（需真机推送验证）  
- 工作区是否仍有未提交的 UI 设计稿改动（与主链路无关）

---

**旧版交接文档已废弃删除**：`docs/UI项目完整交接文档.md`（内容并入本文 + UI 仍以 `app.wxss` / drawio 为准）。  
**唯一正式交接**：本文 `docs/PROJECT_HANDOFF.md`。
