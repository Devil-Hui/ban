# 排班小程序 — 业务流程审查报告

> 审查对象：`docs/business-flows.md` (v3.4) + `docs/user-scenarios.md`
> 审查方法：系统化调试（先定位根因，再给方案）+ 全链路逐流程/逐表核对
> 日期：2026-07-07

---

## 0. 审查结论速览

现有 v3.4 设计在**权限模型、隐私三级管控、软删除全链路、状态机**上已经相当扎实，可作为落地基础。但存在 **9 处阻断级/数据一致性缺陷**、**11 处功能缺失**、**6 处规范缺口**，直接导致「API 无法无歧义生成」「运维端与小程序端一致性无保障」。

最关键的三个根因：
1. **状态机与表枚举不一致**（`generating` 状态在状态机图中出现，但 `tasks.status` 枚举里没有）。
2. **`countdowns` 表被设计但从未被任何流程使用**，截止逻辑直接查 `tasks.deadline`，提醒偏移 `notify_offset` 形同虚设。
3. **运维端（H5）只有场景描述，没有一条流程/接口定义**，而用户明确要求「API 支撑运维端与小程序端数据同步与一致性」。

---

## 一、严重问题（阻断性 / 数据不一致）🔴

### P1 · `tasks.status` 枚举缺失 `generating`
- **现象**：状态机图（四、流程 645 行）含 `generating (云函数计算中)`，但表 2.4 的 `status` 枚举为 `draft / collecting / reviewing / adjusting / published / archived`，**无 `generating`**。
- **根因**：状态机细化（v3.2）新增了 `generating`，但表结构（v3.0）未同步。
- **后果**：生成方案期间任务无合法中间态；前端轮询无状态可依赖；DB 写入会违反枚举约束。
- **改进**：在 `tasks.status` 枚举补 `generating`；或改为用独立 `schedule_jobs` 表记录计算状态、`tasks.status` 仅停留在 `reviewing`。**推荐后者**（计算态与业务态解耦，见 api-spec §一致性）。

### P2 · `countdowns` 表设计但流程从未使用
- **现象**：表 2.8 定义 `countdowns(target_time, notify_offset, status, reopened_by...)`，但流程 11 的定时任务 SQL 直接 `SELECT ... FROM tasks WHERE status='collecting' AND deadline<=NOW()`，**未命中 `countdowns` 表**；`notify_offset`（默认 -30min 催促）无任何流程消费。
- **根因**：表设计（v3.0）与流程设计（v3.3 截止逻辑）分头演进，未对齐。
- **后果**：「截止前 30 分钟催促提醒」降级闭环承诺无法兑现；`countdowns` 成为死表。
- **改进**：以 `countdowns` 为**唯一调度真相源**——创建任务时写入一条 `pending` 记录；定时任务扫 `countdowns` 触发「截止关闭 + 发送催促」；`notify_offset` 用于推导催促发送时间。详见 api-spec 任务调度接口。

### P3 · 字段命名不一致 `final_schedules` vs `final_schemes`
- **现象**：表 2.4 字段名为 `final_schedules`（终态排班结果）；流程 5 注释写「写入表：`tasks.final_schemes`」；流程 6 又写 `final_schedules`。`previous_schemes`（表 2.4）与流程 8 一致。
- **根因**：方案生成（v3.0 算法后移）与表定义命名未统一。
- **后果**：云函数写入字段名不确定，存在写错列风险。
- **改进**：统一为 `final_schedule`（单数，承载一个选定方案）+ `candidate_schedules`（JSON 数组，承载多套候选）。`previous_schedule` 保留上一版。命名全局替换。

### P4 · 分组模板与任务时段归属混乱（`groups.time_config` / `groups.cycle_rule` vs `tasks.periods` / `tasks.cycle_rule`）
- **现象**：`groups` 有 `mode / time_config / cycle_rule`；`tasks` 也有 `cycle_rule / periods / template_style`。但**没有任何流程说明 `groups.time_config` 何时写入、发布者创建任务时时段是从分组模板带出还是重新填**。
- **根因**：把「分组级默认配置」和「任务级实际配置」两套概念混在一起，又没定义映射关系。
- **后果**：创建任务接口的请求体无法无歧义定义；运维端「可视化配置默认班次模板」（场景 2）与小程序端创建任务的数据流断裂。
- **改进**：明确分层——`groups.time_config` = 分组默认班次模板（运维/发布者预置）；创建任务时 `POST` 请求体可传 `periods` 覆盖，不传则继承分组模板。新增「默认模板下发」接口（api-spec §Groups）。

### P5 · `users` 表缺封禁字段，却设计了封禁流程
- **现象**：场景 13 / 权限矩阵断言「超管可封禁用户，写入 audit_logs」，但 `users` 表（2.1）只有 `role`，**无 `status / is_banned / banned_at / banned_reason`**。且 admin 用户被 `INSERT` 时用 `'admin_lisi'` 当 `openid`（场景 1），而 admin 是账号密码体系，不应有 openid。
- **根因**：H5 运维端模型（账号密码）与小程序端模型（openid）在 `users` 表未分库/未分区。
- **后果**：封禁无法持久化；被封禁用户打开小程序无任何拦截逻辑；admin 账号与微信用户同表易串。
- **改进**：`users` 增加 `account_type enum('wechat','admin')`、`status enum('normal','banned')`、`banned_reason`、`username`、`password_hash`（仅 admin）；小程序登录只写 `openid`，H5 登录只写 `username/password_hash`。封禁接口落 `status='banned'` 并写 audit。

### P6 · 订阅消息跳转路径缺 `share_token`，预览接口必填
- **现象**：模板 3/4 跳转路径为 `/pages/preview/preview?id={{task_id}}`（仅 task_id）；但流程 10.1 预览接口校验「`tasks WHERE id=$tid AND share_token=$token`」，**必须 share_token**，且安全要点明确「不直接用 task_id 做预览参数」。
- **根因**：通知模板设计与预览鉴权设计分头编写，未对齐。
- **后果**：成员点推送进来预览页会因缺 token 直接 403，核心查收链路断裂。
- **改进**：跳转路径统一为 `/pages/preview/preview?task_id={{task_id}}&token={{share_token}}`；`share_token` 在发布时生成并随推送 payload 下发。

### P7 · `draft` 状态被定义但无任何流程使用
- **现象**：状态机表 4.1 把 `draft` 列为「草稿，可编辑/删除/发布」，但流程 3 创建任务直接 `INSERT ... status='collecting'`（发布即收集），无「保存草稿」入口。
- **根因**：状态机从通用框架照搬，未裁剪到本产品。
- **后果**：`draft` 是死状态；创建任务的「存草稿 vs 立即发布」语义不清。
- **改进**：要么（A）删除 `draft`，创建即 `collecting`（MVP 推荐，简化）；要么（B）保留并新增「保存草稿」接口与「草稿列表」。建议 MVP 选 A，在 api-spec 中显式废弃 `draft`。

### P8 · 退出分组（`left`）是否软删进行中任务的标记未定义
- **现象**：踢人（流程 9）明确软删 `task_responses(is_valid=false)` + `user_assignments(is_active=false)`；但主动退出（场景 9 / 9.3）**只写 `status='left'`，未说明进行中任务标记如何处理**。
- **根因**：退出与踢人视为两种操作，但一致性影响相同，却只定义了一半。
- **后果**：退出成员的历史标记仍可能被方案算法计入（除非算法额外过滤 `status='active'`），与「软删全链路」原则矛盾。
- **改进**：退出与踢人走**同一清理逻辑**（统一为 `remove_member`），区别仅在 `status` 取值（`left` vs `kicked`）与是否黑名单。算法读取响应时必须 `JOIN group_members.status='active'`。

### P9 · 生成方案结果无持久化状态机
- **现象**：流程 5 云函数「返回 3 套方案」但没说写回哪、前端轮询什么、失败如何感知；`tasks` 无「计算任务 ID」关联。
- **根因**：异步计算只画了算法，没画任务生命周期。
- **后果**：前端无法可靠等待结果；重复点击「生成方案」会并发算多次。
- **改进**：引入 `schedule_jobs` 表（或 `tasks` 加 `generating_job_id`）+ 幂等：`POST /tasks/{id}/schemes:generate` 返回 `202 + jobId`，`GET /jobs/{jobId}` 轮询 `pending|success|failed`，成功回写 `candidate_schedules`。详见 api-spec。

---

## 二、重要问题（功能缺失）🟡

### F1 · 运维端（H5）零接口定义
场景 1/2/13 描述了超管/运维操作，但**没有任何流程细化其数据流与接口**。用户明确要求「API 支撑运维端与小程序端同步」。需补全：登录、创建管理员、数据大屏指标、审计日志查询、封禁/解封、默认模板配置、分组只读列表、指标实时流（SSE）。→ 见 api-spec §运维端。

### F2 · 消息中心 / 站内通知（红点兜底）缺失
降级闭环承诺「订阅消息失败 → 小程序内红点」，但**没有消息中心页面、没有「获取我的未读通知」接口、没有已读回写**。红点成了空承诺。需补 `GET /me/notifications` + `POST /me/notifications/{id}/read` + 红点计数接口。

### F3 · 个人日历完整 CRUD 缺失
`personal_calendars` 表存在，但只有「AI 识别写入 / 导入」。无「编辑已有日历」「删除日历」「设为默认」接口。用户多日历管理（9.3）无法落地。

### F4 · 历史排班记录查询缺失
profile 页「历史排班记录」无对应接口；需 `GET /me/assignments?status=history` 或独立 `GET /me/history`。

### F5 · AI 课表识别完整流程缺失
8.4 给了策略，但流程 4 只写「从课表导入」。缺独立流程：上传图片 → `imgSecCheck` → 调 OCR → 规则解析 → 3 方案 → 用户确认 → 写 `personal_calendars`。需补 `POST /me/calendars/ocr`（202 + jobId）与轮询。

### F6 · 创建分组流程缺失
场景 3 描述了创建分组，但 business-flows 无「流程 0」：邀请码生成规则（6 位、碰撞重试）、是否可自定义分组名、重名/超员处理、`groups.time_config` 初始化均未定义。

### F7 · 延长截止时间流程缺失
状态机有「延长截止 → collecting(重新收集)」，流程 11 仅提「发布者收到通知可手动关闭或延长」。缺：延长对已有 `task_responses` 的处置（保留 or 清空）、`countdowns` 如何更新、提醒如何重排。

### F8 · 取消/废弃任务流程缺失
状态机有「废弃/取消 → archived」，但无副作用定义：进行中任务的 `task_responses / user_assignments / notify_queue` 如何处理？已发布任务能否取消？需补 `POST /tasks/{id}/cancel`。

### F9 · 查看成员脱敏手机号接口缺失
权限矩阵 6 断言「查看成员手机号：独立 API，AES 解密 + 脱敏」，但无该接口定义、无解密服务、无 AES key 管理（KMS）说明。需补 `GET /groups/{id}/members/{uid}/contact`。

### F10 · 用户注销（PIPL 合规）缺失
《个人信息保护法》赋予用户删除权。当前无任何注销/数据导出接口。需补 `POST /me/delete`（逻辑删除 + 异步清理）+ `GET /me/export`（数据导出）。

### F11 · 文件/图片上传接口缺失
`imgSecCheck` + 云存储返回 URL 是 OCR 前置依赖，但无独立上传接口定义（含安全审核结果返回）。

---

## 三、一般问题（规范 / 体验）🟢

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| G1 | 所有列表查询无分页/游标/总数 | 万级用户下首页/成员/通知全量返回会拖垮接口 | 统一 `page/pageSize` 或 `cursor`，返回 `total` |
| G2 | 无乐观锁/版本号 | 并发提交标记、并发调整方案会互相覆盖 | 核心表加 `version`，写时 `WHERE version=?` |
| G3 | 接口命名混用 `/api/...` 与 `/pages/...` | 路径语义混乱，难维护 | 统一 `/api/v1` RESTful（见 api-spec 命名规范） |
| G4 | 时区未统一 | `deadline` 本地时间 vs 存储 UTC 易错 | 服务端统一存 UTC（Z），业务时区 `Asia/Shanghai` 由客户端渲染 |
| G5 | 限流/防刷未设计 | 邀请码可爆破、生成方案可刷 | 网关层按 openid/appid 限流，敏感写加频控 |
| G6 | `notify_queue.payload` 结构未定义 | 模板渲染缺 data 契约 | 统一定义 `payload { keywords:{}, path:"" }` |
| G7 | 历史归档「90 天转冷存储」无机制 | 表会无限膨胀 | 定时任务搬运 `archived` 超期数据到冷表/对象存储 |
| G8 | `tasks.template_style` 未使用 | 死字段 | 明确含义或删除 |
| G9 | 微信昵称改后 `display_name` 不更新 | 显示旧名 | 提供「同步微信昵称」入口或创建时快照 |
| G10 | 审计 `before/after` 仅 kick 写 reason | 审计不全链路 | 统一定义审计写入中间件，所有敏感写自动快照 |
| G11 | 双端数据实时同步无方案 | H5 大屏数字滞后、小程序改完 H5 不刷新 | 事件驱动失效 + Redis 缓存 + SSE（见 api-spec 一致性） |

---

## 四、改进建议汇总（按优先级）

### P0（必须，阻塞 API 生成）
1. 修 P1/P3 命名与枚举不一致（表结构 v3.5）。
2. 修 P5 `users` 表拆分 wechat/admin + 封禁字段。
3. 修 P6 推送跳转补 `share_token`。
4. 决策 P7 `draft` 去留（建议 MVP 废弃）。

### P1（首版必须，双端同步核心）
5. 以 `countdowns` 为调度真相源重做流程 11（P2）。
6. 退出/踢人统一 `remove_member` 清理逻辑（P8）。
7. 引入 `schedule_jobs` 异步状态机（P9）。
8. 补运维端全量接口（F1）+ 消息中心（F2）。

### P2（体验 / 合规）
9. 补个人日历 CRUD（F3）、历史查询（F4）、AI 识别流程（F5）、创建分组（F6）、延长截止（F7）、取消任务（F8）、脱敏手机号（F9）。
10. 补 PIPL 注销/导出（F10）、上传接口（F11）。
11. 列表分页（G1）、乐观锁（G2）、时区（G4）、限流（G5）、归档（G7）。

---

## 五、待补充流程清单（明确要补的 API 映射）

| 新流程 | 对应 API | 说明 |
|--------|----------|------|
| 流程 0：创建分组 | `POST /api/v1/groups` | 含邀请码生成 |
| 流程 4.5：AI 识别课表 | `POST /api/v1/me/calendars/ocr` + `GET /jobs/{jobId}` | 异步 |
| 流程 9.5：退出分组 | `DELETE /api/v1/groups/{id}/members/me` | 复用 remove_member |
| 流程 11'：调度（重写） | `countdowns` 驱动 + `POST /tasks/{id}/extend-deadline` | 修 P2 |
| 流程 13：取消任务 | `POST /api/v1/tasks/{id}/cancel` | 修 F8 |
| 流程 14：消息中心 | `GET /api/v1/me/notifications` | 修 F2 |
| 流程 15：运维登录/管理 | `POST /api/v1/admin/login` 等 | 修 F1 |
| 流程 16：注销/导出 | `POST /api/v1/me/delete` + `GET /api/v1/me/export` | 修 F10 |

> 全部接口的完整定义见 `docs/api-spec.md`。
