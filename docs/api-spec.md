# 排班小程序 — API 接口规范文档（v1）

> 版本：API v1 | 日期：2026-07-07
> 配套：依赖 `docs/business-flows.md` (v3.4) 与 `docs/flow-review-report.md`
> 适用端：微信小程序端（wechat）+ H5 运维端（admin），双端共享同一 CloudBase MySQL

---

## 0. 配套表结构调整建议（落地前必读）

依据 `flow-review-report.md` 的 P1/P3/P5 等阻断项，接口定义基于以下 **v3.5 表结构约定**（在 v3.4 基础上微调，不改变业务语义）：

| 表 | 调整 | 原因 |
|----|------|------|
| `tasks` | `status` 枚举改为 `collecting / reviewing / adjusting / published / archived`（**废弃 `draft`**，MVP 创建即收集）；字段 `final_schedules` → `final_schedule`；新增 `candidate_schedules`（JSON 数组，多套候选）；`previous_schemes` → `previous_schedule`；新增 `version`（乐观锁）；新增 `generating_job_id`（关联异步任务） | P1/P3/P7 |
| `users` | 新增 `account_type enum('wechat','admin')`、`status enum('normal','banned')`、`banned_reason`、`username`、`password_hash`（仅 admin）；小程序登录只写 `openid` | P5 |
| `groups` | `time_config` 明确为「分组默认班次模板」；新增 `version` | P4 |
| `schedule_jobs`（新增） | `id, task_id, status(pending/running/success/failed), result(json), error_msg, created_at, finished_at` | P9 |
| `countdowns` | 作为**唯一调度真相源**被流程 11 消费；`notify_offset` 用于推导催促时间 | P2 |

> 接口请求体中的字段名严格遵循上表。

---

## Part A · 架构规范（大型互联网企业级）

### A1 整体架构（四层 + 双端同步通道）

```
┌─────────────────┐                        ┌─────────────────┐
│  小程序端 wechat │                        │   H5 运维端 admin │
│  WXML/WXSS/JS    │                        │  React + Antd Pro │
└────────┬────────┘                        └────────┬────────┘
         │ HTTPS + JWT (openid 体系)                 │ HTTPS + JWT (账号密码体系)
         │                                          │
         ▼                                          ▼
┌────────────────────────────────────────────────────────────────┐
│  API Gateway（CloudBase HTTP 云函数）                              │
│  统一鉴权 → 参数校验 → 限流 → 权限注解 → 脱敏 → 审计中间件           │
└────────┬─────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│  Service Layer（云函数聚合）                                        │
│  user / group / task / schedule-engine / ai-vision / notify / audit│
└────────┬─────────────────────────────────────────────────────────┘
         │ 本地事务 + 乐观锁
         ▼
┌────────────────────────────────────────────────────────────────┐
│  Data Layer                                                        │
│  CloudBase MySQL（主库） │ Redis（指标缓存） │ 云存储（图片）        │
│  领域事件总线（事件 → Redis 失效 + SSE 推送 H5）                     │
└────────────────────────────────────────────────────────────────┘
```

### A2 统一响应包络（Envelope）

所有接口返回统一结构。**成功** `HTTP 2xx`：

```json
{
  "code": 0,
  "message": "success",
  "data": { },
  "requestId": "req_8f3a2c",
  "timestamp": "2026-07-07T03:12:00Z"
}
```

**失败** `HTTP 4xx/5xx`（`code` 取 HTTP 状态码，`error.code` 取业务错误码）：

```json
{
  "code": 404,
  "message": "group not found",
  "error": {
    "code": "GROUP_NOT_FOUND",
    "field": "groupId",
    "detail": "groupId=G99999 不存在或已归档"
  },
  "requestId": "req_8f3a2c",
  "timestamp": "2026-07-07T03:12:00Z"
}
```

约定：
- `data` 为 `null` 时省略该字段或显式 `null`。
- `requestId` 全链路透传，用于排障与审计关联。
- 时间统一 ISO 8601 **UTC（后缀 Z）**；业务时区 `Asia/Shanghai` 由客户端渲染。

### A3 接口命名规范

1. **基础路径**：`https://{env}.api.example.com/api/v1`，`env ∈ {dev, staging, prod}`。
   - 微信小程序需在后台配置 **request 合法域名**（HTTPS 强制）+ upload/download 域名白名单。
2. **资源层级（名词复数，无动词）**：
   - `GET /api/v1/groups` 列表
   - `POST /api/v1/groups` 创建
   - `GET /api/v1/groups/{groupId}`
   - `GET /api/v1/groups/{groupId}/members`
   - `GET /api/v1/groups/{groupId}/tasks`
   - `POST /api/v1/groups/{groupId}/tasks`
   - `GET /api/v1/tasks/{taskId}`
3. **动作表达**：
   - 标准 CRUD 用 `GET/POST/PUT/PATCH/DELETE`。
   - **非 CRUD 动作**用「子资源 + HTTP 方法」或「冒号动作」：
     - `POST /api/v1/tasks/{taskId}/schemes:generate`（生成方案，异步）
     - `POST /api/v1/tasks/{taskId}/extend-deadline`（延长截止）
     - `POST /api/v1/tasks/{taskId}/cancel`（取消）
     - `POST /api/v1/groups/{groupId}/members/{userId}/kick`（踢人）
   - **禁止**在路径里用动词名词混写（如 `/api/getGroupList`、`/pages/...`）。
4. **过滤/分页/排序**用 query：`?status=collecting&page=1&pageSize=20&sort=-createdAt`。
5. **字段命名**：请求/响应体字段统一 **camelCase**（小程序端 JS 友好）；DB 列名 snake_case（仅服务端内部）。

### A4 版本管理

- **URL 路径版本** `/api/v1`（不放在 Header，便于微信云函数路由与网关灰度）。
- **兼容性规则**：
  - 新增字段 = 兼容，无需升版本，旧客户端忽略即可。
  - 删除/重命名字段、改语义、改路径 = **不兼容**，升 `v2`，`v1` 保留至少 180 天并标记 `Deprecated`。
  - 响应中携带 `X-Api-Version: v1` 头，便于灰度观测。
- **废弃流程**：文档标注 ⚠️Deprecated → 客户端迁移期 → 网关返回 `299` 警告头 → 到期下线。

### A5 认证与鉴权

**小程序端（wechat）**
- 登录：`POST /api/v1/auth/wechat-login` 用 `wx.login()` 的 `code` 换 `openid`，签发 JWT。
- Token：`Authorization: Bearer {jwt}`，JWT 含 `sub=openid, typ=wechat, role, exp`。
- 刷新：`POST /api/v1/auth/refresh`（用 `refreshToken`，rotation 机制，旧 token 进黑名单）。
- 客户端：`wx.setStorageSync('access_token')`；`401` 自动走 refresh 后重试原请求（见 business-flows `utils/request.js`）。

**运维端（admin）**
- 登录：`POST /api/v1/admin/login` 用 `username + password_hash`（bcrypt），签发独立 JWT（`typ=admin`）。
- `superadmin` 才能 `POST /api/v1/admin`（建 admin）；`admin` 仅有运维只读 + 封禁。

**权限模型映射**（详见 business-flows 第六章，接口层用注解强制）：
```
@RequireRole('group_publisher')   // 发布者操作
@RequireRole('group_member')      // 成员操作（且 status=active）
@RequireRole('superadmin')        // 运维最高
@RequireRole('admin')             // 运维
```

### A6 错误码体系（分层）

HTTP 状态码语义：`200/201/202` 成功；`400` 参数；`401` 未登录；`403` 无权限；`404` 资源不存在；`409` 冲突；`422` 业务规则拒绝；`429` 限流；`500` 内部；`503` 维护。

业务错误码（`error.code`，字符串，模块前缀 + 序号）：

| 模块 | 错误码 | HTTP | 含义 |
|------|--------|------|------|
| 认证 | `AUTH_TOKEN_MISSING` | 401 | 缺 token |
| | `AUTH_TOKEN_INVALID` | 401 | token 非法 |
| | `AUTH_TOKEN_EXPIRED` | 401 | token 过期 |
| | `AUTH_WECHAT_CODE_INVALID` | 401 | wx.login code 失效 |
| | `AUTH_ADMIN_BAD_CREDENTIAL` | 401 | 运维账号密码错 |
| 用户 | `USER_NOT_FOUND` | 404 | 用户不存在 |
| | `USER_BANNED` | 403 | 用户被封禁 |
| | `USER_ALREADY_EXISTS` | 409 | 账号已存在 |
| 分组 | `GROUP_NOT_FOUND` | 404 | 分组不存在/已归档 |
| | `GROUP_CODE_INVALID` | 400 | 邀请码格式错 |
| | `GROUP_CODE_CONFLICT` | 409 | 邀请码碰撞（服务端重试） |
| | `GROUP_FULL` | 409 | 分组满员 |
| 成员 | `MEMBER_NOT_IN_GROUP` | 403 | 不在该分组 |
| | `MEMBER_ALREADY` | 409 | 已在该分组 |
| | `MEMBER_BLACKLISTED` | 403 | 被拉黑，需发布者解除 |
| | `MEMBER_NOT_PUBLISHER` | 403 | 非发布者 |
| | `MEMBER_CANNOT_KICK_SELF` | 403 | 不能踢自己 |
| | `MEMBER_LEFT` | 409 | 已退出（可重入） |
| 任务 | `TASK_NOT_FOUND` | 404 | 任务不存在 |
| | `TASK_STATUS_INVALID` | 409 | 状态不允许该操作 |
| | `TASK_DEADLINE_PASSED` | 422 | 截止已过 |
| | `TASK_NOT_PUBLISHER` | 403 | 非该任务发布者 |
| | `TASK_NO_VALID_RESPONSE` | 422 | 无有效标记 |
| 方案 | `SCHEDULE_JOB_NOT_FOUND` | 404 | 任务不存在 |
| | `SCHEDULE_JOB_RUNNING` | 409 | 正在计算，勿重复 |
| | `SCHEDULE_INSUFFICIENT` | 422 | 人数不足 |
| 标记 | `RESPONSE_WINDOW_CLOSED` | 422 | 收集已截止 |
| | `RESPONSE_DUPLICATE` | 409 | 重复提交（幂等返回原值） |
| 查收 | `RECEIPT_NOT_FOUND` | 404 | 查收记录不存在 |
| | `RECEIPT_ALREADY_CONFIRMED` | 409 | 已确认 |
| 日历 | `CALENDAR_NOT_FOUND` | 404 | 日历不存在 |
| | `CALENDAR_OCR_FAILED` | 422 | 识别失败（降级手动） |
| | `CALENDAR_OCR_RUNNING` | 409 | 识别中 |
| 通知 | `NOTIFY_NOT_FOUND` | 404 | 通知不存在 |
| 预览 | `PREVIEW_TOKEN_INVALID` | 403 | 分享 token 错 |
| | `PREVIEW_TOKEN_EXPIRED` | 410 | 分享链接过期 |
| 配置 | `CONFIG_NOT_FOUND` | 404 | 配置不存在 |
| 通用 | `VALIDATION_ERROR` | 422 | 参数校验失败 |
| | `RATE_LIMITED` | 429 | 触发限流 |
| | `SYS_ERROR` | 500 | 系统错误 |
| | `SYS_MAINTENANCE` | 503 | 维护中 |

### A7 数据一致性保障方案（用户重点要求）

双端共享同库，"同步"靠以下五道防线：

**① 强一致 — 本地事务**
所有多表写必须包在 DB 事务内。明确事务边界：
- 加入分组：`group_members` INSERT（+ 重入 UPDATE）。
- 提交标记：`task_responses` UPSERT。
- 发布方案：`tasks` UPDATE + `user_assignments` 批量 INSERT + `task_receipts` 批量 INSERT + `notify_queue` 批量 INSERT。
- 踢人/退出（统一 `remove_member`）：`group_members` + `task_responses(is_valid)` + `user_assignments(is_active)` + `audit_logs` + `notify_queue`。
- 异议处理：`tasks` + `task_receipts` + `notify_queue`。
- 取消任务：`tasks` + 级联软删 `task_responses/user_assignments/notify_queue`。

**② 乐观锁（防并发覆盖）**
`tasks / groups / group_members` 带 `version`。写时 `UPDATE ... WHERE id=? AND version=?`，影响行数 0 → 返回 `409 CONFLICT`，客户端拉最新后重试。

**③ 幂等**
- 天然幂等：加入 `UNIQUE(group_id,user_id)`；标记 `UNIQUE(task_id,user_id)` + `ON DUPLICATE UPDATE`。
- 生成方案：同 task 进行中 job 存在 → `409 SCHEDULE_JOB_RUNNING`。
- **全局幂等头**：所有写接口支持 `Idempotency-Key: {uuid}`（24h 内同 key 返回首次结果，避免弱网重发重复写）。

**④ 异步任务状态机**
`schedule_jobs`：`pending → running → success/failed`。前端 `POST .../schemes:generate` 拿 `jobId` 后 `GET /jobs/{jobId}` 轮询，杜绝「计算态无落点」（修 P9）。

**⑤ 实时同步（运维大屏 ↔ 小程序）**
- 指标聚合写入 **Redis**（TTL 60s），H5 读缓存不直查主库。
- 小程序敏感写完成后 **publish 领域事件**（`task.published` / `member.kicked` / `task.cancelled`）→ 触发 Redis 指标失效 + **SSE 推送在线 H5 会话**。
- H5 订阅：`GET /api/v1/admin/metrics/stream`（SSE，text/event-stream）。
- 降级：SSE 断线 → H5 前端 30s 轮询 `GET /api/v1/admin/metrics`。
- **对账任务**：每日定时扫 `user_assignments` vs `tasks.final_schedule` 一致性、扫 `group_members` 孤儿引用，异常写 `audit_logs` + 告警。

**⑥ 软删除统一**
所有"删除" = 状态翻转（`status/is_active/is_valid`），**物理 DELETE 禁用**（DB 触发器拦截或 ORM 强制）。

**⑦ 审计全链路**
统一 `audit` 中间件，敏感写自动快照 `before/after`，运维与小程序审计进同一 `audit_logs`，`target_type` 区分。

### A8 公共约定

- **分页**：`page`（默认1）、`pageSize`（默认20，最大100）；响应 `data.list` + `data.pagination {total, page, pageSize}`。游标分页用于通知流：`?cursor=xxx&limit=20`。
- **限流**：网关按 `appid + openid` 限流（默认 100 req/min/用户，生成方案 5 req/min/task）；超限返回 `429 RATE_LIMITED` + `Retry-After` 头。
- **脱敏**：手机号统一 `138****1234`；微信号永不返回；发布者查手机号走独立接口且服务端 AES 解密后立即脱敏。
- **时区**：请求体时间可用 `YYYY-MM-DD HH:mm`（业务时区 Asia/Shanghai），响应统一 UTC（Z）。

---

## Part B · 小程序端接口（wechat）

> `Base: /api/v1` ｜ 需 `Authorization: Bearer {jwt}`

### B1 认证 Auth

#### B1.1 微信登录
`POST /api/v1/auth/wechat-login`

请求体：
```json
{ "code": "081abc...", "inviteCode": "X9K2M" }
```
| 字段 | 必选 | 说明 |
|------|------|------|
| code | 是 | `wx.login()` 临时 code |
| inviteCode | 否 | 若从小程序卡片带码进入，登录后直达加入 |

响应 `200`：
```json
{
  "code": 0, "data": {
    "accessToken": "eyJ...", "refreshToken": "rf_...",
    "expiresIn": 7200,
    "user": { "id": "U03", "nickname": "小明", "avatarUrl": "", "role": "user" },
    "needProfile": false
  }
}
```

#### B1.2 刷新 Token
`POST /api/v1/auth/refresh`
请求体：`{ "refreshToken": "rf_..." }` → `200` 返回新 `accessToken`（rotation）。

#### B1.3 当前用户
`GET /api/v1/auth/me` → `200` 返回 `user` + 其分组角色摘要。

---

### B2 分组 Group

#### B2.1 我的分组列表
`GET /api/v1/groups` ｜ query: `?status=active`
响应 `data.list`：`[{id,name,inviteCode,roleInGroup, memberCount}]`

#### B2.2 创建分组（流程 0）
`POST /api/v1/groups`
请求体：
```json
{
  "name": "计科202值班群",
  "cycleRule": "weekly",
  "timeConfig": { "periods": [{"id":"p1","name":"早班","start":"08:00","end":"10:00"}] }
}
```
| 字段 | 必选 | 说明 |
|------|------|------|
| name | 是 | 分组名（2-20 字） |
| cycleRule | 否 | 默认 weekly |
| timeConfig | 否 | 分组默认班次模板，创建任务时可继承 |
响应 `201`：`{id, name, inviteCode, roleInGroup:"publisher"}`（邀请码服务端生成，6 位去重）。

#### B2.3 分组详情
`GET /api/v1/groups/{groupId}` → 含 `timeConfig`、`memberCount`、`myRole`。

#### B2.4 通过邀请码加入（流程 2）
`POST /api/v1/groups/join`
请求体：`{ "inviteCode": "X9K2M", "displayName": "小红" }`
| 字段 | 必选 | 说明 |
|------|------|------|
| inviteCode | 是 | 6 位 |
| displayName | 否 | 默认微信昵称 |
业务规则：已存在 `status∈(left,kicked)` 且未拉黑 → 重入（UPDATE active）；拉黑 → `403 MEMBER_BLACKLISTED`；不存在 → INSERT。返回 `409 MEMBER_ALREADY` 时带当前状态。

#### B2.5 退出分组（流程 9.5）
`DELETE /api/v1/groups/{groupId}/members/me`
→ 事务：`status='left'` + 复用 `remove_member` 清理进行中任务标记（修 P8）。

---

### B3 成员 Member（发布者）

#### B3.1 成员列表
`GET /api/v1/groups/{groupId}/members` ｜ query:`?role=member&page=1`
响应：`list[{userId, displayName, roleInGroup, status, joinedAt}]`（**不含 phone**）。

#### B3.2 成员脱敏联系方式（修 F9）
`GET /api/v1/groups/{groupId}/members/{userId}/contact`
→ 仅 publisher；服务端 AES 解密 + 脱敏：`{displayName:"小强", phoneMasked:"138****1234"}`。

#### B3.3 踢出成员（流程 9）
`POST /api/v1/groups/{groupId}/members/{userId}/kick`
请求体：`{ "reason": "长期不配合", "blacklist": false }`
→ 事务 + 审计（修 P5/P8）。

#### B3.4 解除黑名单
`POST /api/v1/groups/{groupId}/members/{userId}/unban` → `status` 保持 `kicked`，`is_blacklisted=0`。

---

### B4 任务 Task

#### B4.1 创建任务（流程 3）
`POST /api/v1/groups/{groupId}/tasks`
请求体：
```json
{
  "title": "国庆假期值班",
  "description": "",
  "dateRangeStart": "2026-10-01",
  "dateRangeEnd": "2026-10-07",
  "cycleRule": "weekly",
  "periods": [{"id":"p1","name":"早班","start":"08:00","end":"10:00"}],
  "constraints": { "slotMinPeople": 1, "maxShiftsPerDay": null, "maxShiftsPerWeek": null },
  "deadline": "2026-10-01 23:59"
}
```
| 字段 | 必选 | 说明 |
|------|------|------|
| title | 是 | 任务标题 |
| dateRangeStart/End | 是 | 排班日期范围 |
| periods | 否 | 不传则继承 `groups.timeConfig` |
| deadline | 是 | 强制设定（修 v3.0 #3） |
| constraints | 否 | 默认 `slotMinPeople:1` |
→ `201` 写入 `status='collecting'` + `countdowns` 调度记录（修 P2）+ 推送创建提醒。

#### B4.2 任务列表
`GET /api/v1/groups/{groupId}/tasks` ｜ `?status=collecting&page=1`

#### B4.3 任务详情
`GET /api/v1/tasks/{taskId}` → 含 `status`、`deadline`、`constraints`、`myResponseStatus`、`myReceiptStatus`。

#### B4.4 编辑任务（发布前）
`PATCH /api/v1/tasks/{taskId}` → 仅 `status='collecting'` 且未有人提交时可改（乐观锁 `version`）。

#### B4.5 延长截止（流程 11'）
`POST /api/v1/tasks/{taskId}/extend-deadline`
请求体：`{ "newDeadline": "2026-10-02 23:59", "keepResponses": true }`
规则：`keepResponses=true` 保留已提交标记并回 `collecting`；`countdowns` 重排 + 重发催促。

#### B4.6 取消任务（流程 13，修 F8）
`POST /api/v1/tasks/{taskId}/cancel`
请求体：`{ "reason": "人数不足" }`
→ 事务：任务 `archived` + 进行中 `task_responses/user_assignments` 软删 + 未发 `notify_queue` 取消 + 审计。

---

### B5 方案生成与发布（异步，修 P9）

#### B5.1 生成方案
`POST /api/v1/tasks/{taskId}/schemes:generate`
→ `202 Accepted` + `{jobId, status:"pending"}`。前置校验人数不足返回 `422 SCHEDULE_INSUFFICIENT`（带 `insufficient[]`，前端给放宽/补人/忽略）。
重复点击：`409 SCHEDULE_JOB_RUNNING`。

#### B5.2 轮询方案结果
`GET /api/v1/jobs/{jobId}`
响应：`{status:"success", result:{candidateSchedules:[...], userShiftCount:{}}}`

#### B5.3 发布选定方案（流程 6）
`POST /api/v1/tasks/{taskId}/publish-scheme`
请求体：`{ "selectedIndex": 1, "manualAdjustments": [{"date":"2026-10-01","periodId":"p1","userIds":["U06"]}] }`
→ 事务：写 `final_schedule` + `share_token` 刷新 + `user_assignments` + `task_receipts(pending)` + 查收推送。返回新 `shareToken`。

#### B5.4 重新发布（异议后，流程 8）
`POST /api/v1/tasks/{taskId}/republish`
→ `status: adjusting→published`，全员 `task_receipts` 重置 pending，旧异议 `resolved`，`share_token` 刷新（旧链接失效）。

---

### B6 空闲标记 Response（成员）

#### B6.1 我的标记
`GET /api/v1/tasks/{taskId}/my-response` → 仅返回本人（隐私隔离）。

#### B6.2 提交/更新标记（流程 4）
`PUT /api/v1/tasks/{taskId}/my-response`
请求体：`{ "availableSlots": [{"date":"2026-10-01","periodId":"p1"}], "source": "manual" }`
规则：`status='collecting'` 且未截止（否则 `422 RESPONSE_WINDOW_CLOSED`）；UPSERT 幂等。

#### B6.3 发布者重开某成员（流程 12）
`POST /api/v1/tasks/{taskId}/responses/{userId}/reopen` → 该成员标记置无效 + 推送重填。

---

### B7 查收 Receipt（成员 / 发布者）

#### B7.1 我的查收
`GET /api/v1/tasks/{taskId}/my-receipt`

#### B7.2 确认查收（流程 7）
`POST /api/v1/tasks/{taskId}/receipts/confirm` → `task_receipts` 写 confirmed。

#### B7.3 提出异议
`POST /api/v1/tasks/{taskId}/receipts/object`
请求体：`{ "reason": "10月4日回老家" }` → `objected` + 通知发布者。

#### B7.4 异议列表（发布者）
`GET /api/v1/tasks/{taskId}/objections` ｜ `?resolved=false`

#### B7.5 处理异议（流程 8）
`POST /api/v1/tasks/{taskId}/objections/{userId}/resolve`
请求体：`{ "action": "accept", "reason": "" }`（`accept`→调 republish；`reject`→`resolved=true`）

---

### B8 个人日历 Calendar（修 F3/F5）

#### B8.1 我的日历列表
`GET /api/v1/me/calendars`

#### B8.2 新建日历（手动）
`POST /api/v1/me/calendars`
请求体：`{ "name":"2026秋季课表", "cycleRule":"weekly", "slots":[{"dayOfWeek":1,"periods":[1,2,3],"label":"高数"}] }`

#### B8.3 编辑 / 删除
`PUT /api/v1/me/calendars/{calendarId}` ｜ `DELETE /api/v1/me/calendars/{calendarId}`

#### B8.4 AI 识别课表（流程 4.5，异步）
`POST /api/v1/me/calendars/ocr`
请求体：`{ "imageUrl": "cloud://...", "name": "识别课表" }`（图片须先过 `imgSecCheck`）
→ `202` + `{jobId}`；`GET /api/v1/jobs/{jobId}` 返回 `candidateLayouts[3]`；用户选定后 `POST /api/v1/me/calendars`（source='ai_vision'）落库。失败 `422 CALENDAR_OCR_FAILED` → 前端降级手动。

---

### B9 日程快照 Assignment（日程页，修 F4）

#### B9.1 我的日程（月视图）
`GET /api/v1/me/assignments` ｜ `?month=2026-10&groupId=G01`
→ `user_assignments` 快照（is_active=true），含本人班次 + 同组他人姓名（发布后脱敏手机号）。

#### B9.2 任务发布后排班表（全组）
`GET /api/v1/tasks/{taskId}/assignments` → 全组成员排班，姓名 + 脱敏手机（发布后可见）。

#### B9.3 历史排班
`GET /api/v1/me/history` ｜ `?year=2026` → 时间轴，按年月筛选。

---

### B10 通知 Notify（消息中心，修 F2）

#### B10.1 我的通知列表（红点兜底）
`GET /api/v1/me/notifications` ｜ `?cursor=&limit=20&unreadOnly=false`
→ `list[{id, type, title, body, taskId, isRead, createdAt}]` + `unreadCount`。

#### B10.2 标记已读
`POST /api/v1/me/notifications/{id}/read` ｜ 批量 `POST /api/v1/me/notifications/read` `{ids:[]}`

#### B10.3 订阅设置
`GET /api/v1/me/notification-settings` ｜ `PUT /api/v1/me/notification-settings` `{pushEnabled:true}`
> 微信订阅消息需用户授权，授权结果在此登记；拒绝则仅靠 B10.1 红点兜底。

---

### B11 分享预览 Preview（流程 10）

#### B11.1 脱敏预览
`GET /api/v1/share/tasks/{taskId}?token={shareToken}`
→ 校验 token（错 `403 PREVIEW_TOKEN_INVALID`，超 7 天 `410 PREVIEW_TOKEN_EXPIRED`）；返回姓名 + 时段，**无 phone**。

---

### B12 用户 User（含 PIPL，修 F10）

#### B12.1 我的资料
`GET /api/v1/me` ｜ `PUT /api/v1/me` `{nickname, avatarUrl}`

#### B12.2 导出我的数据
`GET /api/v1/me/export` → 返回本人全部数据打包下载链接（PIPL 权利）。

#### B12.3 注销账号
`POST /api/v1/me/delete` `{reason}` → 逻辑删除 + 异步清理（保留审计）。

---

## Part C · 运维 H5 端接口（admin，修 F1）

> `Base: /api/v1/admin` ｜ 需 `Authorization: Bearer {adminJwt}`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/admin/login` | 账号密码登录 | 公开 |
| POST | `/admin` | 创建运维账号 | superadmin |
| GET | `/admin/metrics` | 数据大屏指标（Redis 缓存） | admin |
| GET | `/admin/metrics/stream` | SSE 实时指标（双端同步） | admin |
| GET | `/admin/audit-logs` | 审计日志查询（分页/筛选） | admin |
| POST | `/admin/users/{userId}/ban` | 封禁用户（写 `users.status`） | superadmin |
| POST | `/admin/users/{userId}/unban` | 解封 | superadmin |
| GET | `/admin/config/templates` | 默认班次模板列表 | admin |
| PUT | `/admin/config/templates/{id}` | 编辑默认模板 | superadmin |
| GET | `/admin/groups` | 分组只读列表 | admin |

**指标一致性**：`/admin/metrics` 读 Redis 聚合（分组总数、用户总数、活跃任务、今日排班人次）；小程序端敏感写触发 Redis 失效 + SSE，H5 实时刷新（详见 A7⑤）。

---

## Part D · 异步任务约定（Jobs）

所有「生成方案 / AI 识别」走统一 job 模型：
```
POST ... → 202 { jobId, status:"pending" }
GET /api/v1/jobs/{jobId} → { status:"pending|running|success|failed", result?, error? }
```
- `failed` 时必须返回可降级指引（如 OCR 失败 → 「试试手动输入」）。
- job 结果保留 24h，过期 `404`。

---

## Part E · 双端数据同步与一致性方案（用户重点，汇总）

```
小程序写 ──┐                              ┌── H5 实时刷新
(标记/发布/踢人) → [事务 MySQL] → 领域事件 → Redis失效 + SSE ─┘
                                      └→ 告警/对账(每日)
H5 写(封禁/配置) ─→ [事务 MySQL] → 事件 → 小程序下次拉取生效
```

落地清单：
1. **同库事务**保证写操作的强一致（A7①，事务边界已列）。
2. **乐观锁 + 幂等头**防并发与弱网重发（A7②③）。
3. **领域事件 + Redis + SSE** 让运维大屏实时感知小程序变更（A7⑤）。
4. **每日对账**兜底最终一致（A7⑤）。
5. **软删除 + 统一审计**保证全链路可追溯（A7⑥⑦）。
6. 运维端**只读业务数据**，仅管理级写（封禁/配置），不干预分组排班（权限矩阵，business-flows 第六章）。

---

## Part F · 接口契约测试要点（TDD 应用）

每个关键接口必须通过的契约测试（红-绿-重构前先写失败测试）：

| 接口 | 必测用例 |
|------|----------|
| `POST /groups/join` | 新加入✅ / 已退出重入✅ / 拉黑拒绝❌403 / 错码❌400 / 幂等✅ |
| `POST /tasks/{id}/my-response` | 截止后可提交❌422 / 隐私隔离（他人不可见）✅ / UPSERT幂等✅ |
| `POST /tasks/{id}/kick` | 非发布者❌403 / 不能踢自己❌403 / 拉黑选项生效✅ / 事务原子性（task_responses 同步软删）✅ |
| `POST /tasks/{id}/schemes:generate` | 重复点击❌409 / 人数不足❌422(带 insufficient) / job 轮询 success✅ |
| `POST /tasks/{id}/publish-scheme` | share_token 刷新✅ / user_assignments 生成✅ / 查收推送✅ |
| `GET /share/tasks/{id}` | 无 token❌403 / 过期❌410 / 脱敏无 phone✅ |
| `GET /admin/metrics` | 封禁用户后指标下降（事件生效）✅ / 缓存 TTL 内不直查主库✅ |
| `PUT /tasks/{id}` | version 冲突❌409（并发编辑）✅ |

> 测试先行：先用上述契约写集成测试（Mock CloudBase MySQL + Redis），再落地云函数实现。

---

## 附录：接口总览（计数）

- 小程序端：B1–B12 共 **44** 个接口
- 运维端：C 共 **11** 个接口
- 异步轮询：`GET /api/v1/jobs/{jobId}` **1** 个通用接口（被生成方案 B5.1、AI 识别 B8.4 复用）
- 合计 **56** 个接口（44 小程序 + 11 运维 + 1 通用轮询），覆盖全部 12 个业务流程 + 审查报告新增 8 个流程。
