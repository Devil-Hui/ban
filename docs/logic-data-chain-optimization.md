# 排班小程序 · 逻辑链 / 数据链 / 按钮触发规范（大厂视角 · 麻雀虽小五脏俱全）

> 版本：v1.1 | 日期：2026-07-18  
> 配套：`business-flows.md` v3.5 · `api-spec.md` · 现网 `miniprogram/` + `backend/`  
> 目标：任一按钮都能回答——**谁可见 → 点了校验什么 → 调什么接口 → 写哪些表 → 失败如何降级**

---

## 0. 阻断问题：`touristappid` Error

### 0.1 现象

开发者工具 / 真机出现与 **tourist appid** 相关的登录失败、`wx.login` 异常、code2Session 无效。

### 0.2 根因

| 层 | 问题 | 位置 |
|----|------|------|
| 工程配置 | `appid: "touristappid"` 为微信**游客模式占位**，非真实小程序 | `miniprogram/project.private.config.json` |
| 运行时 | 游客 AppID 拿到的 `code` **无法**被正式 `jscode2session` 兑换 openid | 微信开放平台规则 |
| 后端 | `WX_APPID` / `WX_SECRET` 为空时走 dev 假 openid，与游客 code 混用导致身份不稳定 | `backend/src/core/auth.js` |
| 前端 | 原 `BASE_URL` 写成 `/miniapp/v1`，与后端 `/api/v1` 不一致，登录链路直接 404 | 已修复为 `utils/config.js` |

### 0.3 修复清单（必须人工完成 ①）

1. **替换 AppID**  
   - 打开 [微信公众平台](https://mp.weixin.qq.com) → 开发 → 开发管理 → 开发设置  
   - 复制真实 **AppID**  
   - 写入：
     - `miniprogram/project.config.json` → `appid`
     - `miniprogram/project.private.config.json` → `appid`  
   - 当前仓库已改为占位：`REPLACE_WITH_YOUR_WX_APPID`（**禁止**再写 `touristappid`）

2. **后端环境变量**（`backend/.env`）
   ```ini
   WX_APPID=你的真实AppID
   WX_SECRET=你的AppSecret
   ```
   - 本地无密钥时：后端用 `dev_openid_*` 假登录（仅开发）  
   - 真机 / 体验版：**必须**真实密钥

3. **合法域名**  
   - 生产：`request` 合法域名 = 后端 HTTPS 域名  
   - 本地：开发者工具勾选「不校验合法域名、web-view、TLS…」  
   - 已将 `urlCheck: false` 写入私有配置便于联调

4. **BASE_URL 对齐**  
   - 前端 `utils/config.js` → `dev: http://127.0.0.1:3000/api/v1`  
   - 与 `backend` 路由前缀 `/api/v1` 一致

### 0.4 验收

| 步骤 | 期望 |
|------|------|
| 工具重新打开项目 | 详情页 AppID 为真实值，非 tourist |
| 启动后端 `npm run dev` | `:3000` listening |
| 模拟器点击「我的 → 微信登录」 | 拿到 token，`users` 有记录 |
| 创建分组 | 成功并跳转详情 |

---

## 1. 大厂级「五脏」架构原则

| 原则 | 落地 |
|------|------|
| **单一配置源** | 环境 / BASE_URL / 班次标签 / 轮询参数 → `utils/config.js` |
| **单一请求通道** | 鉴权、401 刷新、错误 Toast → `utils/request.js` |
| **Service 解包** | 页面不猜 `data.group` vs `data` → `services/*` 归一 |
| **按钮 = 状态机边** | 每个按钮绑定：角色 × 任务状态 × 防抖 |
| **写操作事务边界** | 发布 / 踢人 / 加入 多表写在服务端原子完成 |
| **失败可解释** | 业务码 + 中文 message；前端 Toast；关键路径 silent 重试 |
| **隐私分阶段** | collecting 仅本人；published 脱敏；share 只读 token |
| **软删除** | kicked/left/is_valid/is_active，不物理删 |
| **异步可观测** | 生成方案 / OCR → jobId 轮询，超时提示 |

---

## 2. 端到端主逻辑链（总图）

```
[App.onLaunch]
  silentLogin: wx.login → POST /auth/miniprogram/login
       → users UPSERT → JWT → storage
       ↓ 失败：tokenReady=false，页面写操作再 ensureLogin
[Tab 分组]
  GET /groups → group_members⋈groups
  创建 → POST /groups → groups + group_members(publisher)
  加入 → POST /groups/join → group_members(member|重入)
       ↓
[分组详情]
  并行 GET group / members / tasks
  新建任务 → POST /groups/{id}/tasks → tasks(collecting)
  踢人 → DELETE members/{uid} → status=kicked
  退出 → POST leave → status=left
       ↓
[任务详情] 按 myRole × status 渲染
  成员填报 → PUT responses/me → task_responses UPSERT
  发布者生成 → POST scheme-jobs → schedule_jobs
            → 轮询 GET /jobs/{id}
  发布者发布 → POST publish → tasks.published + assignments + inbox + share_token
  成员异议 → POST receipts/me/objection → task_receipts
  分享 → path 带 shareToken；外人 GET /share/tasks/{id}
```

---

## 3. 数据链（表级）

| 动作 | INSERT/UPDATE | 读 |
|------|------------------|-----|
| 登录 | `users` UPSERT by openid | JWT claims.userId |
| 创建分组 | `groups` + `group_members(publisher)` | 列表 JOIN active |
| 加入 | `group_members` INSERT 或 status→active | 黑名单 is_blacklisted |
| 建任务 | `tasks status=collecting` | 组内任务列表 |
| 填空闲 | `task_responses` UPSERT UNIQUE(task,user) | 仅本人 GET |
| 生成方案 | `schedule_jobs` + `tasks.generating_job_id` + `candidate_schedules` | 轮询 job |
| 发布 | `tasks.final_schedule/status/share_token` + `user_assignments` + `notify_inbox` | 排班表/消息 |
| 异议 | `task_receipts` | 发布者列表（设计） |
| 踢/退 | `group_members.status`（设计级联 responses/assignments） | 成员列表过滤 active |
| 分享预览 | 无写 | tasks by share_token，脱敏 |

**状态机（任务）**

```
collecting → (generate job) → reviewing/collected
          → publish → published ⇄ adjust → published
          → cancel → archived/cancelled
```

---

## 4. 按钮级规范（完整）

### 约定

每个按钮描述格式：

- **可见**：角色 / 状态  
- **前置**：登录 / 二次确认 / 防重复  
- **接口**  
- **写表**  
- **成功 UX**  
- **失败分支**

---

### 4.1 全局 / 启动

| 触发 | 可见 | 前置 | 接口 | 写表 | 成功 | 失败 |
|------|------|------|------|------|------|------|
| App 静默登录 | 自动 | — | `POST /auth/miniprogram/login` | users | tokenReady | 控制台 warn，不挡首屏 |
| 写操作 ensureLogin | 隐式 | 无 token 则 login | 同上 | users | 继续业务 | Toast「检查 AppID 与后端」 |

---

### 4.2 页面「分组」index

| 按钮 | 可见 | 前置 | 接口 | 写表 | 成功 | 失败 |
|------|------|------|------|------|------|------|
| ＋创建分组 | 登录用户 | Sheet 名称非空 | `POST /groups` | groups, group_members | Toast→进详情 | 401/校验 |
| 创建·提交 | Sheet | ensureLogin + 防抖 submitting | 同上 | 同上 | navigateTo group | Toast |
| 加入分组 | 登录用户 | 邀请码≥4 | `POST /groups/join` | group_members | 进详情 | 无效码/黑名单/已在组 |
| 分组卡片 | 有组 | — | — | — | navigateTo | — |
| 下拉刷新 | 全员 | — | `GET /groups` | — | 重绘列表 | 空列表 |

---

### 4.3 页面「分组详情」group

| 按钮 | 可见 | 前置 | 接口 | 写表 | 成功 | 失败 |
|------|------|------|------|------|------|------|
| ＋新建 | publisher | — | 开 Sheet | — | — | 非发布者 Toast |
| 创建任务·提交 | publisher | 标题非空 | `POST /groups/{id}/tasks` | tasks | 进 task | 403 非发布者 |
| 任务卡片 | 组员 | — | — | — | navigateTo task | — |
| 展开成员 | 组员 | — | — | — | 本地 toggle | — |
| 移出 | publisher 且目标非发布者 | Modal 确认 | `DELETE .../members/{uid}` | group_members.kicked | 刷新列表 | 不能踢自己 |
| 退出分组 | 非发布者成员 | Modal 红确认 | `POST .../leave` | group_members.left | navigateBack | 进行中任务 1206 |

---

### 4.4 页面「任务详情」task（核心）

| 按钮 | 可见条件 | 前置 | 接口 | 写表 | 成功 | 失败 |
|------|----------|------|------|------|------|------|
| 时段芯片 toggle | member ∧ collecting | — | 本地 selected | — | 高亮 | 非收集中忽略 |
| 提交 / 更新时间 | member ∧ collecting | ≥1 时段 | `PUT .../responses/me` | task_responses | Toast 已提交 | 截止/非收集 |
| 生成方案 | publisher ∧ collecting | 防抖 generating | `POST .../scheme-jobs` | schedule_jobs, tasks | 轮询至成功 | 人数不足 1306 |
| 发布排班 | publisher ∧ generated/有候选 | ensureLogin | `POST .../publish` | tasks, assignments, inbox | shareToken + 订阅请求 | 状态非法 |
| 取消任务 | publisher ∧ collecting | Modal | `POST .../cancel` | tasks archived | navigateBack | — |
| 调整 | publisher ∧ published | 有 finalSchedule | `POST .../adjust` | previous+final | 刷新 | — |
| 延长截止 | publisher ∧ published | 选日期 | `POST .../deadline/extend` | tasks.deadline | 刷新 | — |
| 提出异议 | member ∧ published | 原因非空 | `POST .../receipts/me/objection` | task_receipts | Toast | 非 published |
| 分享 | 有 shareToken | open-type=share | — | — | 卡片 path 带 token | — |
| 分享只读进页 | 持 token 外人 | 登录失败兜底 | `GET /share/tasks/{id}?token=` | 无 | 脱敏表 | 403/410 |

**轮询参数**（config）：间隔 1s，最多 30 次；status 兼容 `success`/`succeeded`。

---

### 4.5 页面「我的」profile

| 按钮 | 可见 | 前置 | 接口 | 写表 | 成功 | 失败 |
|------|------|------|------|------|------|------|
| 微信登录 | 未登录 | **用户点击**（合规） | login + PATCH /users/me | users | 刷新资料 | AppID/网络 Toast |
| 切换 | 已登录 | 点击 | 同登录 | users | 换资料 | — |
| 从截图识别 | 已登录 | chooseMedia | `POST .../calendar/ocr` | schedule_jobs | 提示识别中 | 取消选图 |
| 消息项 | 有 inbox | — | 未读则 PATCH read | notify_inbox | 角标-1 | — |

---

## 5. 前后端契约对齐（本次已修）

| 问题 | 修复 |
|------|------|
| BASE_URL `/miniapp/v1` | → `/api/v1`（config 分环境） |
| 登录不回 user | `miniprogramLogin` 回传脱敏 user；前端无 user 再拉 `/users/me` |
| 发布强制 finalSchedule | 后端可用 candidate[0] 兜底；前端尽量带 body |
| 填报字段 availability vs availableSlots | 双端归一 |
| 异议 content vs objectionReason | 双端归一 |
| 分组/任务详情无 myRole | getOne 注入 myRole + responseCount |
| job status 命名 | 前端兼容 success/succeeded |
| 订阅模板占位 | 未配置真实 ID 时 skip，不打断发布 |
| services 不解包 | groups/tasks/auth/notify 统一解包 |

---

## 6. 角色 × 页面可见性（速查）

| 页面区域 | 游客 | 成员 | 发布者 | 运维 H5 |
|----------|:----:|:----:|:------:|:-------:|
| 分组列表 | 引导登录 | ✅ | ✅ | — |
| 创建/加入 | 登录后 | ✅ | ✅ | — |
| 新建任务/踢人 | ❌ | ❌ | ✅ | ❌ |
| 填空闲 | ❌ | collecting | collecting | ❌ |
| 生成/发布/取消 | ❌ | ❌ | ✅ | ❌ |
| 异议 | ❌ | published | — | ❌ |
| 分享预览 | token | ✅ | ✅ | token |
| 消息/日历 | 登录后 | ✅ | ✅ | — |
| 封禁/大屏 | ❌ | ❌ | ❌ | ✅ |

---

## 7. 本地联调最小路径（绕过 tourist 前也可验业务）

```bash
# 终端 1
cd backend && npm install && npm run dev   # DB_MODE=memory，无微信密钥用假 openid

# 开发者工具
# 1) 填真实 appid（或临时用测试号）
# 2) 详情 → 本地设置 → 不校验合法域名
# 3) utils/config.js env='dev' → 127.0.0.1:3000
# 4) 编译 → 我的 → 登录 → 创建分组 → 建任务 → 填报 → 生成 → 发布
```

`npm test`（backend）覆盖 E2E：登录→建组→加入→标记→生成→发布→分享→异议→调整。

---

## 8. 后续增强（非阻断，按优先级）

| P0 | 真 AppID + WX_SECRET + 合法域名 |
| P0 | 发布事务补齐 task_receipts 初始化（设计级） |
| P1 | 踢人/退出级联 is_valid / is_active |
| P1 | 确认查收按钮 + 发布者异议处理台 |
| P2 | WebSocket / onShow 增量刷新 |
| P2 | 日程 Tab（设计 4 Tab） |
| P2 | 支付模块与业务解耦开关 |

---

## 9. 时段模型：节次 + 时间段（非早午晚）

产品默认**不再使用**「早班/午班/晚班」硬编码，统一为可配置：

```json
periods: [
  { "id": "p1", "name": "第1节", "start": "08:00", "end": "08:45" },
  { "id": "t2", "name": "10:00-12:00", "start": "10:00", "end": "12:00" }
]
```

| 模板 id | 名称 | 用途 |
|---------|------|------|
| `class_periods` | 按节次 | 第1–10节 + 起止时间（默认） |
| `time_blocks` | 按时间段 | 2 小时一块值班 |
| `half_day` | 上下午 | 上午/下午/晚上三大段 |

- 创建任务：选择模板 + 日期范围 → 写入 `tasks.periods` + `dateRangeStart/End`
- 填报：日期 × periodId 芯片
- 排班表：`schedule-view` 动态列 = periods
- 配置源：`miniprogram/utils/config.js` 的 `periodTemplates`

---

## 10. 一句话

**逻辑链**按「角色 × 状态」驱动按钮；**数据链**按「事务 + 软删 + 快照 + 异步 job」落库；时段按 **节次/时间段 JSON** 配置而非固定三班；**touristappid** 必须换成真实 AppID，并与后端 `/api/v1`、WX 密钥、合法域名一起打通。
