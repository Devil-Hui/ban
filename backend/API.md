# 排班小程序后端 API 说明文档（v1）

> 配套文件：`openapi.yaml`（Apifox 可直接导入）、`src/`（可运行实现）、`tests/`（可运行测试）。

---

## 1. 基础约定

| 项 | 说明 |
|----|------|
| 基址 | `https://api.example.com` |
| 版本前缀 | `/api/v1` |
| 风格 | RESTful：资源名复数、小写+连字符；方法语义化（GET 查 / POST 建 / PUT 全量改 / PATCH 部分改 / DELETE 删） |
| 鉴权 | 请求头 `Authorization: Bearer <accessToken>` |
| 端标识 | 请求头 `X-Client-Type: miniprogram \| h5`（默认 miniprogram），用于区分双端逻辑 |
| 统一响应 | `{ "code": 0, "message": "success", "data": {...}, "requestId": "uuid", "timestamp": 1700000000000 }`；`code=0` 成功，非 0 见错误码表 |

**分页通用参数**：`page`（默认 1，最小 1）、`pageSize`（默认 20，最大 100）。返回含 `{ list, total, page, pageSize }`。

**时间**：服务端统一存 **UTC**（`+00:00`），接口返回 ISO8601 字符串，前端按用户时区展示。

---

## 2. 小程序端 / H5 端差异（按模块）

| 模块 | 小程序端（miniprogram） | H5 运维端（h5） |
|------|------------------------|-----------------|
| 登录鉴权 | `wx.login()` 拿 `code` → `POST /auth/miniprogram/login` 换 openid 签发 JWT | 账号密码 → `POST /auth/h5/login` 签发带 `admin` 角色 JWT |
| 分享 | 用 `onShareAppMessage` 直接打开小程序内预览页（带登录态） | 用 URL `+ ?token=` 打开 `GET /share/tasks/{id}` 只读脱敏页（无登录态） |
| 订阅消息 | 前端 `wx.requestSubscribeMessage` 后回传受理结果到 `POST /notify/subscribe` | 无订阅消息能力，统一走消息中心轮询/红点 |

> 同一套后端、同一张路由表（`src/server/routes.js`）服务双端，差异仅由 `X-Client-Type` 与鉴权方式决定。

---

## 3. 逻辑链与数据链（核心流程）

```
① 登录
   └─ MP: code→openid→JWT          H5: 账号密码→JWT(admin)
② 分组
   └─ 创建分组(creator=publisher) → 邀请码 → 成员加入(group_members)
③ 任务
   └─ 发布者建任务(tasks.status=collecting) → 成员标记空闲(task_responses)
④ 生成方案（异步）
   └─ 触发 scheme_generate(schedule_jobs) → 后台计算候选方案(candidate_schedules)
⑤ 发布
   └─ 写 final_schedule + 分配快照(user_assignments) + 生成 share_token + 推送消息(notify_inbox)
⑥ 预览
   └─ MP: onShareAppMessage 内页        H5: /share/tasks/{id}?token= (脱敏)
⑦ 异议/调整
   └─ 成员提异议(task_receipts) → 发布者 adjust → previous_schedule 备份 + 重新发布
```

**数据依赖**：`group_members.group_id→groups.id`；`tasks.group_id→groups.id`、`tasks.publisher_id→users.id`；`task_responses.task_id→tasks.id`；`user_assignments.task_id→tasks.id`；`notify_inbox.user_id→users.id`。所有写操作在 `published` 等状态转换处通过 **乐观锁 `version`** 与 **事务（发布方案）** 保障一致性。

---

## 4. 接口详情（按模块）

### 4.1 鉴权 auth

#### POST /api/v1/auth/miniprogram/login — 小程序登录
| 参数 | 类型 | 必选 | 默认 | 备注 |
|------|------|------|------|------|
| code | string | 是 | — | `wx.login` 临时凭证 |
| nickname | string | 否 | — | 微信昵称，首次自动建档 |
| avatarUrl | string | 否 | — | 头像地址 |

返回：`{ accessToken, refreshToken, tokenType:"Bearer", expiresIn }`

#### POST /api/v1/auth/h5/login — H5 登录
| 参数 | 类型 | 必选 | 默认 | 备注 |
|------|------|------|------|------|
| username | string | 是 | — | 运维账号 |
| password | string | 是 | — | 运维密码 |

返回：同上（角色为 `admin`）。

#### POST /api/v1/auth/refresh — 刷新令牌
| 参数 | 类型 | 必选 | 默认 | 备注 |
|------|------|------|------|------|
| refreshToken | string | 是 | — | 登录/刷新返回的 refreshToken |

返回：新的 `accessToken` 等。

### 4.2 用户 users

| 方法 | 路径 | 用途 | 关键参数 |
|------|------|------|----------|
| GET | /api/v1/users/me | 当前用户 | — |
| PATCH | /api/v1/users/me | 改资料 | nickname?, avatarUrl? |
| GET | /api/v1/users/me/calendar | 个人课表 | — |
| PUT | /api/v1/users/me/calendar | 建/更课表 | semesterName(必), cycleRule(默认 weekly), slots[](默认 []) |
| POST | /api/v1/users/me/calendar/ocr | 课表 OCR(异步) | imageUrl(必) → 返回 {jobId,status} |

返回 `User`：`{ id, nickname, avatarUrl, phone(脱敏), isBanned }`。

### 4.3 分组 groups

| 方法 | 路径 | 用途 | 关键参数 |
|------|------|------|----------|
| POST | /api/v1/groups | 建分组(creator=publisher) | name(必), mode(默认 shift), cycleRule(默认 weekly), templateStyle(默认 1), periods[](默认 []) |
| GET | /api/v1/groups | 我的分组 | — |
| GET | /api/v1/groups/{groupId} | 分组详情 | groupId(路径) |
| POST | /api/v1/groups/join | 邀请码加入 | inviteCode(必) |
| GET | /api/v1/groups/{groupId}/members | 成员列表 | groupId(路径) |
| DELETE | /api/v1/groups/{groupId}/members/{userId} | 踢人(发布者) | groupId,userId(路径) |
| POST | /api/v1/groups/{groupId}/members/leave | 退出(自己) | groupId(路径) |

### 4.4 任务 tasks

| 方法 | 路径 | 用途 | 关键参数 |
|------|------|------|----------|
| POST | /api/v1/groups/{groupId}/tasks | 建任务(发布者) | title(必), deadline?, periods?[], constraints? |
| GET | /api/v1/groups/{groupId}/tasks | 任务列表 | status?, page(1), pageSize(20) |
| GET | /api/v1/tasks/{taskId} | 任务详情 | taskId(路径) |
| POST | /api/v1/tasks/{taskId}/scheme-jobs | 触发生成(异步) | — → {jobId,status} |
| GET | /api/v1/jobs/{jobId} | 任务进度 | jobId(路径) |
| POST | /api/v1/tasks/{taskId}/publish | 发布方案 | finalSchedule(必){schemeName,assignments[]}, candidateSchedules? |
| POST | /api/v1/tasks/{taskId}/deadline/extend | 延长截止 | deadline(必,UTC) |
| POST | /api/v1/tasks/{taskId}/cancel | 取消(归档) | — |
| POST | /api/v1/tasks/{taskId}/adjust | 异议后重发 | finalSchedule(必) |

`finalSchedule.assignments[]` 结构：`{ date, periodId, periodName, userIds:[], userNames:[] }`。

### 4.5 空闲标记 responses

| 方法 | 路径 | 用途 | 关键参数 |
|------|------|------|----------|
| PUT | /api/v1/tasks/{taskId}/responses/me | 提交空闲(仅收集中) | availableSlots[](必) |
| GET | /api/v1/tasks/{taskId}/responses/me | 查我的空闲 | — |

### 4.6 异议回执 receipts

| 方法 | 路径 | 用途 | 关键参数 |
|------|------|------|----------|
| POST | /api/v1/tasks/{taskId}/receipts/me/objection | 提异议(仅已发布) | objectionReason(必,≤200) |
| GET | /api/v1/tasks/{taskId}/receipts/me | 查我的回执 | — |

### 4.7 分享预览 preview（H5 公开只读）

#### GET /api/v1/share/tasks/{taskId}?token=xxx
| 参数 | 类型 | 必选 | 默认 | 备注 |
|------|------|------|------|------|
| taskId | string | 是 | — | 路径 |
| token | string | 是 | — | 查询参数，7 天有效 |

返回：`{ task:{ id, title, status, publishedAt, schedule:{ schemeName, assignments:[{date,periodId,periodName,userNames[]}] } } }`（手机号脱敏，仅姓名）。

### 4.8 消息 notify

| 方法 | 路径 | 用途 | 关键参数 |
|------|------|------|----------|
| POST | /api/v1/notify/subscribe | 订阅授权记录 | templateIds[](必), accepted?[] |
| GET | /api/v1/users/me/inbox | 消息中心 | page(1), pageSize(20) → {list,total,page,pageSize,unread} |
| PATCH | /api/v1/users/me/inbox/{messageId} | 标记已读 | messageId(路径) |


## 5. 统一错误码表

| code | message | HTTP | 场景 |
|------|---------|------|------|
| 0 | success | 200 | 成功 |
| 4010 | 未登录或登录已失效 | 401 | 缺/无效 Authorization |
| 4011 | 登录已过期，请重新登录 | 401 | token 过期 |
| 4012 | 登录凭证无效 | 401 | token 签名错误 |
| 4030 | 无权访问该资源 | 403 | 非成员/非本人/非发布者 |
| 4040 | 资源不存在 | 404 | 通用未找到 |
| 4090 | 资源状态冲突，请刷新后重试 | 409 | 并发/状态不符 |
| 4290 | 请求过于频繁，请稍后再试 | 429 | 限流 |
| 5000 | 服务器内部错误 | 500 | 未捕获异常 |
| 5001 | 参数校验失败 | 400 | 缺必填/类型错 |
| 5002 | 依赖服务异常 | 502 | 下游失败 |
| 1101 | 用户不存在 | 404 | — |
| 1102 | 个人日程表不存在 | 404 | 未设置课表 |
| 1103 | 课表识别失败，请手动录入 | 422 | OCR 失败 |
| 1201 | 分组不存在 | 404 | — |
| 1202 | 邀请码无效 | 400 | 错误邀请码 |
| 1203 | 你已在该分组中 | 409 | 重复加入 |
| 1204 | 仅分组发布者可执行该操作 | 403 | 非发布者 |
| 1205 | 你已被该分组封禁，无法加入 | 403 | 黑名单 |
| 1206 | 存在进行中的任务，暂不能退出 | 409 | 退出冲突 |
| 1301 | 任务不存在 | 404 | — |
| 1302 | 仅任务发布者可执行该操作 | 403 | 非任务发布者 |
| 1303 | 当前任务状态不允许该操作 | 409 | 状态机不符 |
| 1304 | 任务收集已截止 | 409 | 过期操作 |
| 1305 | 方案生成中，请稍候 | 409 | 生成并发 |
| 1306 | 有效空闲标记不足，无法生成方案 | 422 | 人数不足 |
| 1307 | 数据已被他人更新，请刷新后重试 | 409 | 乐观锁冲突 |
| 1401 | 当前不在收集中，无法标记 | 409 | 非 collecting |
| 1402 | 你已提交过空闲时间 | 409 | 重复提交 |
| 1501 | 你未被分配到该排班 | 403 | — |
| 1502 | 该异议已处理 | 409 | 已 resolved |
| 1601 | 预览链接无效 | 403 | token 错误 |
| 1602 | 预览链接已过期，请联系发布者重新分享 | 410 | token 过期 |
| 1701 | 订阅消息授权失败 | 400 | 空模板 |
| 1901 | 异步任务不存在 | 404 | — |
| 1902 | 异步任务执行失败 | 422 | job failed |

---

## 6. 数据库与字段映射（v3.5）

实现层 `src/repositories/mysql.js` 对应表（详见 `docs/business-flows.md` v3.5）：

`users · groups · group_members · tasks · task_responses · user_assignments · task_receipts · personal_calendars · notify_inbox · schedule_jobs`

连接配置（`src/core/db.js` + `src/config.js`）支持通过 **环境变量/`.env`** 切换 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`，无需改动代码；字符集 `utf8mb4`、时区 `UTC`、连接池上限 `DB_POOL_LIMIT`。

---

## 7. 运行与测试

```bash
# 1. 安装依赖（Express + mysql2，仅本地服务/生产需要；测试零依赖）
npm install

# 2. 内存模式跑通全链路 + 测试（无需数据库）
npm run dev          # 本地服务（DB_MODE=memory）
npm test             # node --test 运行 tests/，覆盖用户/分组/任务/时段模板/分享/消息（无支付）

# 3. 生产模式（配置数据库连接后）
DB_MODE=mysql node src/server/express.js
# 或部署为云函数：导出 src/server/cloud-function.js 的 main
```

> 测试用 `node --test` 内置框架，注入内存仓储驱动与线上完全一致的路由处理器，验证状态机、乐观锁、软删、分享 token、异步 job 等逻辑链与数据链。
