# 旧栈清除 + 新平台唯一入口 · 设计规格

> 版本: v1.0 | 日期: 2026-07-20  
> 状态: 待用户审阅后进入实现计划  
> 范围: 仓库根目录清理 + `new/` 未提交修复落盘；**不重做**五步向导主逻辑  
> 用户确认: 物理删除旧 `miniprogram/` + `backend/`；路径 A；Step5 保留画笔；根 `docs/` 归档至 `docs/legacy/`

---

## 1. 背景与目标

### 1.1 背景

- 新平台主路径已在 `new/` 落地：纯微信登录、建组后缀去重、五步创建任务向导、selectedSlots + rules、收集/求解/发布点击闭环。
- 仓库根仍保留旧栈 `miniprogram/`、`backend/`、`admin-web/`、`shared/` 与根 `docs/*`，易导致：
  - 微信开发者工具打开错误目录；
  - 文档/README 指向已废弃 API；
  - 与「全部改为新版本」的产品要求冲突。
- 工作区另有一批**已验证但未提交**的点击路径修复（asYmd、api.js、availability profile、ui-btn 等），删除旧栈前必须先落盘，避免丢失。

### 1.2 目标

| # | 目标 |
|---|------|
| G1 | 物理删除旧小程序与旧 API：`miniprogram/`、`backend/` |
| G2 | 清除强依赖旧栈的根 `admin-web/`、`shared/` |
| G3 | 根 `docs/` 归档到 `docs/legacy/`，并标明废弃；现行规格只在 `docs/` |
| G4 | 根 `README.md` 明确：DevTools 只开 `apps/miniprogram`，API 在 `services/api` |
| G5 | 提交并保留 `new/` 内已验证的点击修复与 runtime 配置 |
| G6 | 产品五步行为与已确认决策保持一致（见 §3），**不重做** Task 1–15 |

### 1.3 非目标

- 重写五步 domain / period-builder / 求解器
- Step5 改回「点格弹窗设人数」（用户已确认**保留画笔**）
- 完整 xlsx 解析、AI 导课表
- 把旧 `admin-web` 重做成对接新 API 的完整运维台（新平台已有 `apps/admin-web`）
- 修改二级快捷为伪「全国 8:45 众数」（现行 **08:00·45 / 08:30·45 / 手动**，小样本公开作息）

---

## 2. 已确认决策

| 主题 | 决策 |
|------|------|
| 旧栈处理 | **物理删除** `miniprogram/` + `backend/` |
| 实施路径 | **A**：删旧栈 + 清依赖入口 + 提交 `new/` 修复 + 根 README |
| Step5 人数 | **保留画笔模式**（1..N + 擦除） |
| 根 docs | **归档**到 `docs/legacy/`，加废弃说明 |
| 根 admin-web / shared | **删除**（新平台有 `apps/admin-web` 与 miniprogram constants） |
| 产品默认值 | 任务名 placeholder「请输入任务名称」；开始/结束=当天；截止=当天 23:59（已实现，本轮不改语义） |
| 时段快捷 | 08:00·45′ / 08:30·45′ / 手动（已实现，本轮不改数据源） |

---

## 3. 产品主路径（现行能力，本轮只保证不被破坏）

```
冷启动未登录 → login（纯微信，无身份切换）
  → home / groups
  → 建组：uniqueGroupName → 名称 / 名称(2)…
  → group-detail → 创建排班任务
  → Step1 任务信息（空标题 + 当天 + 截止 23:59）
  → Step2 时段与规则（时间段/节次/自定义 + 二级快捷 + 微调 → periods）
  → Step3 初预览（只读课表）
  → Step4 时间选定（默认全不选，至少 1 格）
  → Step5 详细规则（任务级 rules + 画笔 maxPeople）→ POST 创建
  → 填报 availability（含 requiredFields profile）
  → 结束收集 → 求解 → candidates → 发布 result
```

本轮验收以上路径在**删除旧栈后**仍可在 DevTools 点击跑通；不新增向导步骤。

---

## 4. 仓库结构变更

### 4.1 删除

| 路径 | 说明 |
|------|------|
| `miniprogram/` | 旧微信小程序 |
| `backend/` | 旧 Express API |
| `admin-web/` | 旧 H5 管理端（依赖旧 backend/.env） |
| `shared/` | 旧共享常量（已被 `apps/miniprogram/constants/` 覆盖） |

### 4.2 归档

| 源 | 目标 | 说明 |
|----|------|------|
| `docs/*`（根） | `docs/legacy/*` | 保留历史规格，避免误当现行文档 |
| — | `docs/legacy/README.md` | 写明：已废弃；现行文档见 `docs/superpowers/` |

### 4.3 新增 / 更新

| 路径 | 动作 |
|------|------|
| 根 `README.md` | 新建或覆盖为新平台唯一入口说明 |
| `docs/superpowers/specs/2026-07-20-task-create-wizard-design.md` | 文中「从旧 miniprogram 拷贝 seed」改为「seed 已在 apps/miniprogram/constants/」 |
| `.gitignore` | 若仍引用仅旧栈路径，做无害清理（可选） |

### 4.4 目标顶层结构

```
feature-new-platform-foundation/
├── README.md                 # 唯一入口说明
├── docs/
│   └── legacy/               # 归档的旧文档
├── new/                      # 现行 monorepo（唯一主战区）
│   ├── apps/miniprogram/
│   ├── apps/admin-web/
│   ├── services/api/
│   ├── services/deadline-worker/
│   ├── services/notification-worker/
│   ├── services/scheduler/
│   ├── packages/contracts/
│   └── docs/superpowers/
└── .superpowers/sdd/         # 本地 SDD 账本（可不入产品提交）
```

---

## 5. 根 README 内容要求（实现时写入）

必须包含：

1. **项目名称**与一句话目标（校园/社团智能排班）。
2. **唯一代码目录**：`new/`。
3. **微信开发者工具**：打开 `apps/miniprogram`（不要打开仓库根或其他路径）。
4. **本地 API**：
   - ` npm install && npm run infra:up && npm run db:migrate`
   - `npm run build -w @scheduling/api`
   - `API_PORT=3010 node --env-file=.env services/api/dist/main.js`
   - 健康检查：`http://127.0.0.1:3010/health/live`
5. **小程序 develop 默认 API**：`http://127.0.0.1:3010/api/v1`（`runtime-config.js`）。
6. **已移除**：旧 `miniprogram/`、`backend/`；历史文档在 `docs/legacy/`。
7. **密钥**：`.env` 不入库；示例见 `.env.example`。

禁止在 README 中再出现「打开根目录 miniprogram」或「启动 backend/」。

---

## 6. `new/` 未提交修复纳入本轮（落盘范围）

以下均在 `new/` 内，删除旧栈**之前**先提交（可一个或两个 commit）：

| 区域 | 文件（代表） | 原因 |
|------|----------------|------|
| API 日期 | `services/api/src/scheduling/schedule.repository.ts`（asYmd） | MySQL DATE 序列化错误 |
| 客户端请求 | `apps/miniprogram/utils/api.js`、`runtime-config.js`、`app.js` | 空 body、refresh 单飞、3010 |
| 可点 UI | task-detail / group-detail / groups / task-create / schedule-grid | native ui-btn + grid isolation |
| 填报 | `pages/availability/*` | requiredFields → profile；ui-btn |
| 发布 | `pages/candidates/*` | 发布按钮 native ui-btn |
| 测试卫生 | 删除或改写 `test/project-config.test.js` | Jest API 破坏 node:test |

**不纳入本轮产品改动**：mint 邀请 UI 产品化（API 已有；可列为 follow-up）。

---

## 7. 提交顺序（强制）

1. **Commit 1 — new 修复落盘**  
   `feat(miniprogram,api): click-path and date serialization fixes`  
   含 asYmd、api/runtime-config、ui-btn、availability profile、candidates 等。  
   不含删除旧目录。

2. **Commit 2 — 清除旧栈 + 入口文档**  
   `chore: remove legacy miniprogram/backend and document new-only entry`  
   删除 `miniprogram/`、`backend/`、`admin-web/`、`shared/`；  
   根 `docs/*` → `docs/legacy/*` + legacy README；  
   根 `README.md`；  
   修正 `new/docs` 中过时「旧 miniprogram 路径」表述。

3. （可选）**Commit 3** — 仅 docs 文案微调，若 Commit 2 已塞满可拆。

删除前在 worktree 执行 `git status`，确认无未跟踪的重要本地密钥被误加。

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 未提交修复随清仓丢失 | 先 Commit 1 再删目录 |
| 外部书签仍指向旧路径 | 目录删除后打开失败 + README 引导 |
| 历史 PR/文档外链 404 | `docs/legacy` 保留内容；git 历史可恢复整树 |
| 误删 `new/` | 删除列表显式枚举，禁止 `rm -rf` 无路径确认 |
| 测试依赖旧路径字符串 | 全仓 grep `miniprogram/`、`backend/` 后修 `new/` 与根 README 引用 |

---

## 9. 验收标准

1. 工作区/HEAD 中不存在路径：`miniprogram/`、`backend/`、根 `admin-web/`、`shared/`。
2. 存在 `docs/legacy/README.md`，且根 `docs/` 不再以现行规格口吻描述旧栈为主入口。
3. 根 `README.md` 满足 §5，无旧路径启动说明。
4. `curl http://127.0.0.1:3010/health/live` 在重建 API 后可用（环境具备时）。
5. DevTools 打开 `apps/miniprogram`：登录 → 建组（重名有后缀）→ 五步创建（无「国庆假期值班」默认标题）→ 可进入 task-detail。
6. 已点通过的链路不回归：填报（含 name profile）、结束收集、求解、发布（有样本任务或新建任务）。
7. `apps/miniprogram` 显式 node:test 文件集通过；不因 `project-config.test.js` 失败。
8. 密钥与 `.env` 真实值未进入 commit。

---

## 10. 实现注意事项

- **双轨混淆**：任何新功能只写 `new/`。
- **API dist**：改 TS 后必须 `npm run build -w @scheduling/api` 并保证小程序打到的端口（默认 3010）进程使用新 dist。
- **点击验收约束**：用户要求产品验收走 DevTools 点击，不以业务 API 脚本代替通过。
- **automator**：关键按钮用 native `button.ui-btn`；`scheduling-auto-confirm` 跳过 showModal。
- **YAGNI**：不借机重构 `services/api` 架构；不批量替换全部 t-button。

---

## 11. Follow-up（本轮不做）

- task-detail 收集期 **mint 邀请链接** UI
- 矩形多行拖选
- 根 docs/legacy 内容精简或二次迁移到 wiki
- 新 admin-web 与向导 rules 运营对齐验收

---

## 12. 与用户原文对照（摘要）

| 用户要求 | 本轮状态 |
|----------|----------|
| 全部改为新版本 | 唯一入口 `new/` + 删旧栈 |
| 删除旧版本残余 | 删 miniprogram/backend/admin-web/shared；docs 归档 |
| 进首页后建组、名称不重复 | 已有；删除后回归验证 |
| 建任务无「国庆假期值班」、placeholder「请输入任务名称」 | 已有；回归验证 |
| 开始/结束当天、截止当天 23:59 | 已有 date-defaults |
| Step2 时间段/节次/自定义 + 二级快捷 | 已有；快捷 08:00/08:30 |
| Step3 初预览课表 | 已有 |
| Step4 时间选定 | 已有 |
| Step5 详细规则 + 人数 | 已有；**画笔**（用户确认） |
| 微信登录、低耦合、全局 token/错误码 | 已有；本轮不重做 |
| DevTools 均为新版本 | README + 删旧目录强制 |

---

**文档结束。** 用户审阅通过后进入 `writing-plans` 实现计划，再按 §7 顺序提交与删除。
