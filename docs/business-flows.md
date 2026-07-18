# 排班小程序 — 完整业务流程文档 v3.5

> 版本: v3.5 | 日期: 2026-07-07 | 审查修复版（落地 `flow-review-report.md` 的 P1–P9 / F1–F11 / G1–G11）

---

## 一、术语定义（最终收敛）

### 产品定位
**通用轻量协同排班平台**。不局限于大学场景。"节次/课表"仅是一种预置模板，
底层模型为可配置时间段 + 可选个人日历。适配企业轮班、志愿者排班、社团值班等场景。

### 资源基线
**1核2G 可平滑支撑全部服务**。CloudBase 云函数按量计费、自动伸缩，
单实例 512MB~1GB 即可。定时任务、消息队列、AI 识图均走云服务，无需常驻服务器。
自建 Node.js 后端 2核4G 也可承载万级用户日常使用。

### 四个角色，两端分离

```
┌─────────────────────────────────────────────────────────────┐
│                     H5 PC 后台（运维端）                       │
│                                                             │
│  Superadmin ──→ 创建 Admin ──→ 运维管理                       │
│  (平台最高权限)   (运维账号)                                    │
│                                                             │
│  职责：用户封禁/解封、数据大屏、可视化配置模板、审计日志              │
│  登录：账号+密码（独立账户体系，与小程序 openid 无直接绑定）         │
└─────────────────────────────────────────────────────────────┘
                                │
           ┌────────────────────┴────────────────────┐
           │                                          │
┌──────────▼──────────────┐             ┌─────────────▼─────────────┐
│   小程序端 — 发布者       │             │   小程序端 — 加入者          │
│   (Publisher)           │             │   (Joiner)                │
│                         │             │                           │
│   自己创建分组的人         │             │   通过邀请码加入的人          │
│   ── 创建分组/配置模板     │             │   ── 输入邀请码             │
│   ── 发布排班任务         │             │   ── 手动标记空闲时间         │
│   ── 生成排班方案(服务端)   │             │   ── 查收排班结果           │
│   ── 选择方案/手动调整      │             │   ── 申请异议              │
│   ── 踢出成员             │             │                           │
│   ── 查看成员详情(脱敏)     │             │                           │
└──────────────────────────┘             └───────────────────────────┘
```

| 角色 | 英文 | 所在端 | 创建方式 | 权限范围 |
|------|------|--------|----------|---------|
| **Superadmin** | superadmin | H5 PC | 平台初始化 | 全平台最高 |
| **Admin** | admin | H5 PC | Superadmin 创建 | 运维管理 |
| **发布者** | publisher | 小程序 | 创建分组的人 | 自己创建的分组 |
| **加入者** | joiner | 小程序 | 邀请码加入 | 被邀请的分组 |

**一个用户 (User) 在不同分组中可以同时是 publisher 和 joiner。**

---

## 二、数据库表设计 v3.0（修正后）

### 2.1 users（用户表）
```
字段：
- id (PK, bigint, auto_increment)
- account_type (enum: 'wechat', 'admin', default 'wechat')   -- 账户体系：微信小程序 vs 运维 H5（修 P5）
- openid (varchar(64), unique, nullable, indexed)  -- 微信 openid（仅 account_type='wechat' 写入；admin 为 NULL）
- unionid (varchar(64), nullable)                 -- 微信 unionid
- username (varchar(64), unique, nullable)         -- 运维账号（仅 account_type='admin' 写入；小程序用户为 NULL）
- password_hash (varchar(255), nullable)           -- 运维账号密码哈希（仅 admin；小程序用户为 NULL）
- nickname (varchar(64))                           -- 微信昵称 / 运维显示名
- avatar_url (varchar(255))                        -- 头像 URL
- role (enum: 'superadmin', 'admin', 'user', default 'user')  -- 仅运维端使用；小程序端权限由 group_members.role_in_group 决定
- status (enum: 'normal', 'banned', default 'normal')        -- 封禁状态（修 P5）
- banned_reason (text, nullable)                  -- 封禁原因（审计用）
- banned_at (datetime, nullable)
- created_at, updated_at
索引：openid 唯一索引（部分索引 WHERE openid IS NOT NULL），username 唯一索引（admin），(account_type, status)
```

> **微信 / 运维账户分库同表**：`account_type` 区分体系；`openid` 与 `username/password_hash` 互斥填充，彻底杜绝「admin 误写 openid（场景 1 的 'admin_lisi' 错例）、微信用户与运维账号串表」问题（P5 根因）。封禁落 `status='banned'` 并写 audit，被封禁用户打开小程序时接口统一拦截。

### 2.2 groups（分组表）
```
字段：
- id (PK)
- name (varchar(100))
- invite_code (varchar(6), unique, indexed)
- created_by (bigint, FK->users.id, indexed)     -- 创建者 = 发布者
- mode (enum: 'timeline', 'shift', 'custom', default 'shift')
- time_config (json)                              -- 分组默认班次模板（运维/发布者预置）。结构同 tasks.periods：[{id,name,start,end}]
- cycle_rule (enum: 'weekly', 'odd_weekly', 'even_weekly', 'custom', default 'weekly')
- status (enum: 'active', 'archived', default 'active')
- version (int, default 0)                        -- 乐观锁（修 G2）
- created_at, updated_at
索引：invite_code 唯一索引, created_by 索引
```

> **模板继承（修 P4）**：`groups.time_config` 是「分组级默认班次模板」，`tasks.periods` 是「任务级实际配置」。创建任务时请求体可传 `periods` 覆盖；**不传则继承 `groups.time_config`**。运维端「可视化配置默认班次模板」写入 `groups.time_config`，小程序端创建任务优先用分组模板，数据流不断裂。

### 2.3 group_members（分组成员表）
```
字段：
- id (PK)
- group_id (bigint, FK->groups.id, indexed)
- user_id (bigint, FK->users.id, indexed)        -- 唯一身份标识
- display_name (varchar(64))                      -- 分组内显示名（初始=微信昵称）
- class_name (varchar(64))                        -- 班级（可选）
- phone (varchar(80), nullable)                   -- 手机号（AES 加密存储）
- role_in_group (enum: 'publisher', 'member', default 'member')
- status (enum: 'active', 'left', 'kicked', default 'active')
- is_blacklisted (tinyint, default 0)             -- 是否被拉黑（拉黑后无法通过邀请码重新加入）
- joined_at, left_at, kicked_at, kicked_reason
索引：(group_id, user_id) 联合唯一索引
```

### 2.4 tasks（排班任务表）
```
字段：
- id (PK)
- group_id (bigint, FK->groups.id, indexed)
- title (varchar(100))
- description (text)
- date_range_start (date, indexed)
- date_range_end (date)
- cycle_rule (enum: 'weekly', 'odd_weekly', 'even_weekly', 'custom', default 'weekly')
- template_style (tinyint, nullable)              -- 预留样式（当前未使用，保留扩展位；见 G8）
- periods (json)                                  -- 班次定义 [{id, name, start, end}]，支持任意命名（如"早班""晚班""A班"）；不传则继承 groups.time_config（P4）
- constraints (json)                               -- 排班约束
  {
    "slot_min_people": 1,                         -- 每时段最少值班人数
    "max_shifts_per_week": null,                  -- 每人每周最大次数（null=不限）
    "max_shifts_per_day": null                    -- 每人每天最大次数（null=不限）
  }
- deadline (datetime)                              -- 截止时间（发布者设定，无随机偏移；存 UTC，业务时区 Asia/Shanghai 渲染，见 G4）
- status (enum: 'collecting', 'reviewing', 'adjusting', 'published', 'archived')  -- 废弃 draft；generating 由 schedule_jobs 承载（修 P1/P7）
- publisher_id (bigint, FK->users.id)             -- 发布者
- generating_job_id (bigint, nullable)            -- 关联 schedule_jobs.id（生成方案异步进行中非空，修 P9）
- candidate_schedules (json, nullable)             -- 生成的多套候选方案（数组，原 final_schemes 命名统一，修 P3）
- final_schedule (json, nullable)                 -- 最终选定方案（原 final_schedules，修 P3）
- previous_schedule (json, nullable)              -- 上一版方案（adjusting 回滚用，原 previous_schemes，修 P3）
- share_token (varchar(64), nullable, indexed)     -- 分享预览 token（7天有效）
- version (int, default 0)                        -- 乐观锁（修 G2）
- created_at, updated_at, published_at
索引：(group_id, status), publisher_id, deadline, share_token, (status, generating_job_id)
```

### 2.5 task_responses（空闲时间/可值班标记表）
```
字段：
- id (PK)
- task_id (bigint, FK->tasks.id, indexed)
- user_id (bigint, FK->users.id, indexed)
- available_slots (json)                           -- [{date, period_id}]
- source (enum: 'manual', 'imported_course', default 'manual')
- is_valid (boolean, default true)                 -- 踢人后软删除标记
- submitted_at, updated_at
索引：(task_id, user_id) 联合唯一索引
```

### 2.6 personal_calendars（个人日历，原 course_tables 重命名）
```
字段：
- id (PK)
- user_id (bigint, FK->users.id, indexed)
- source (enum: 'manual', 'ai_vision', default 'manual')  -- 录入来源
- image_url (varchar(255), nullable)               -- AI 识别时上传的原图
- name (varchar(100))                                -- 日历名称（如"2026秋季课表"）
- cycle_rule (enum: 'weekly', 'odd_weekly', 'even_weekly', 'custom', default 'weekly')
- slots (json)                                       -- 忙闲时段
  [{day_of_week: 1, periods: [1,2,3], label: "高等数学", location: ""}]
- ai_confidence (decimal(3,2), nullable)             -- AI 识别置信度（仅 source='ai_vision'）
- created_at, updated_at
索引：user_id 索引
```

> **语义泛化**："课表"→"个人日历"。用户可维护多个日历（课表/工作/其他），
> 每个日历独立配置循环规则（每周/单周/双周/自定义）。
> 标记空闲时选择对应日历导入，功能完全可选。

### 2.7 task_receipts（任务查收表）
```
字段：
- id (PK)
- task_id (bigint, FK->tasks.id, indexed)
- user_id (bigint, FK->users.id, indexed)
- receipt_status (enum: 'pending', 'confirmed', 'objected')
- objection_reason (text, nullable)
- resolved (boolean, default false)               -- 异议是否已处理
- receipt_time (datetime)
- resolved_at (datetime)
索引：(task_id, user_id) 联合唯一索引
```

### 2.8 countdowns（截止时间调度表）
```
字段：
- id (PK)
- task_id (bigint, FK->tasks.id, indexed)
- target_time (datetime)                           -- 发布者设定的精确截止
- notify_offset (int, default -1800)               -- 提醒偏移(秒)，默认-30min
- status (enum: 'pending', 'notified', 'closed', 'reopened')
- closed_at, reopened_at, reopened_by, reopen_reason
- member_id (bigint, nullable)                     -- 若单独重开某成员
索引：target_time, status
注意：去除随机偏移，精确触发
```

### 2.9 notify_queue（推送队列表）
```
字段：
- id (PK)
- target_type (enum: 'user', 'group', 'task')
- target_id (bigint)
- template_id (varchar(64))
- payload (json)
- scheduled_at (datetime)
- sent_at (datetime, nullable)
- status (enum: 'pending', 'sent', 'failed', 'cancelled')
- retry_count (int, default 0)
索引：(status, scheduled_at)
```

### 2.10 user_assignments（用户日程快照表，新增）
```
字段：
- id (PK)
- task_id (bigint, FK->tasks.id, indexed)
- user_id (bigint, FK->users.id, indexed)
- date (date)                                      -- 值班日期
- period_id (varchar(32))                          -- 节次/时段 ID
- period_name (varchar(32))                        -- 节次名称
- group_name (varchar(100))                        -- 分组名（冗余，加速查询）
- is_confirmed (boolean, default false)            -- 是否已查收确认
- is_active (boolean, default true)                -- 软删除标记（踢人后设为 false）
- created_at
索引：(user_id, date, is_active) 联合索引
```

### 2.11 audit_logs（审计日志表，新增）
```
字段：
- id (PK)
- operator_id (bigint, FK->users.id)               -- 操作人
- target_type (enum: 'user', 'group', 'task', 'member')
- target_id (bigint)
- action (varchar(64))                             -- kick_member, reopen_submit, etc.
- before_value (json)                               -- 变更前
- after_value (json)                                -- 变更后
- reason (text, nullable)
- ip_address (varchar(64))
- created_at
索引：(operator_id, created_at), (target_type, target_id)
```

### 2.12 schedule_jobs（异步任务表，新增，修 P9）
```
字段：
- id (PK)
- task_id (bigint, FK->tasks.id, indexed)         -- 关联任务
- type (enum: 'generate_schemes', 'ocr_calendar', default 'generate_schemes')
- status (enum: 'pending', 'running', 'success', 'failed', default 'pending')
- progress (int, default 0)                        -- 进度百分比（0~100），供前端展示
- result (json, nullable)                          -- 任务结果（如 candidate_schedules / 解析后的日历 slots）
- error_msg (text, nullable)                       -- 失败原因
- created_at, updated_at, finished_at (datetime, nullable)
索引：(task_id, status), (status)  -- (status) 供定时 worker 扫描 pending/running
```

> **职责**：承载所有「客户端触发、服务端异步计算」的任务（生成方案、AI 识别）。生成方案时 `tasks.status` 仍停留 `reviewing`，仅 `generating_job_id` 指向本表；前端轮询 `GET /jobs/{jobId}` 拿 `pending→running→success/failed`，成功回写 `tasks.candidate_schedules`。彻底解决「计算态无落点、重复点击并发算多次」问题（修 P9）。

### 2.13 notify_inbox（站内通知收件箱，新增，修 F2）
```
字段：
- id (PK)
- user_id (bigint, FK->users.id, indexed)         -- 接收人
- template_id (varchar(64))                        -- 关联 notify_queue.template_id
- payload (json)                                   -- 渲染数据（与 notify_queue.payload 同结构）
- source_task_id (bigint, nullable)                -- 关联任务（点击跳转用）
- is_read (boolean, default false)                 -- 已读标记（红点依据）
- created_at
索引：(user_id, is_read), created_at
```

> **与 notify_queue 职责分离**：`notify_queue` 管「消息有没有发出去」（订阅消息发送队列，可能失败）；`notify_inbox` 管「用户看没看到」（订阅消息失败时的站内红点兜底，修 F2）。推送成功时双写 queue + inbox；推送失败仅写 inbox，保证"不丢消息"。

---

## 三、完整业务流程 v3.0（逐表对应）

### 流程 1：用户首次进入小程序

**用户视角**：
1. 打开微信 → 点击小程序卡片
2. 触发微信授权弹窗 → 点击"允许"
3. 进入小程序首页

**后端数据流**：
1. `wx.login()` → 获取 code
2. `POST /api/auth/wechat-login` 携带 code
3. 云函数 `code2session` → 获取 openid
4. 查 `users` 表 → 不存在则 INSERT，存在则 UPDATE
5. 返回 JWT token + user 信息

**写入表**：`users`
**触发副作用**：JWT 存入 `wx.setStorageSync`

---

### 流程 2：用户输入邀请码加入分组（修复 #1）

**用户视角**：
1. 首页点击"加入/编辑" Tab
2. 点击"输入邀请码"
3. 输入 6 位邀请码
4. 系统自动取微信昵称作为显示名（可修改）
5. 点击"加入"

**后端数据流**：
```sql
-- 1. 验证邀请码
SELECT id, name FROM groups WHERE invite_code = $code AND status = 'active';

-- 2. 校验唯一身份（仅 openid，不再用 wechat_suffix）
SELECT id FROM group_members WHERE group_id = $gid AND user_id = $uid;

-- 3. 已存在 → UPDATE status, left_at=NULL（重入）
-- 4. 不存在 → INSERT 新记录
INSERT INTO group_members (group_id, user_id, display_name, role_in_group)
VALUES ($gid, $uid, $display_name, 'member');
```

**写入表**：`group_members`
**触发副作用**：返回分组详情

---

### 流程 3：发布者创建排班任务（修复 #3, #12）

**用户视角**：
1. 首页 → 点击某分组的"创建任务"
2. 填写：任务标题、描述
3. **选择截止时间**（强制，如"今晚 23:59"或"3 天后"，也可选"不限时"）
4. 选日期范围 + **Switch 切换单双周**
5. 选节次/时间段（系统显示模板样式）
6. **设置约束**：每时段最少 X 人（默认 1）
7. 点击"发布"

**后端数据流**：
```sql
-- 校验发布者身份
SELECT role_in_group FROM group_members 
WHERE group_id = $gid AND user_id = $uid AND role_in_group = 'publisher';

-- 插入任务
INSERT INTO tasks (group_id, title, description, date_range_start, date_range_end,
  cycle_rule, periods, constraints, deadline, status, publisher_id)
VALUES ($gid, $title, $desc, $start, $end, $pattern, $periods, $constraints, $deadline, 'collecting', $uid);

-- 推送"创建提醒"给所有 group_members
INSERT INTO notify_queue (target_type, target_id, template_id, payload, scheduled_at)
SELECT 'user', user_id, 'TEMPLATE_CREATE', $payload, NOW()
FROM group_members WHERE group_id = $gid AND status = 'active';
```

**写入表**：`tasks`, `notify_queue`
**触发副作用**：微信订阅消息推送

---

### 流程 4：加入者手动标记空闲时间（#7 AI 降级）

**用户视角**：
1. 点击"日程" Tab → 看到"正在排班"任务
2. 点击任务 → 进入标记页
3. **方式 1：手动拖拽标记**
   - 7 列（周一~周日）× N 行（节次）网格
   - 点击格子切换"空闲(绿)/忙碌(红)"
   - 支持批量拖选
4. **方式 2：从已有课表导入**
   - 点击"从课表导入"
   - 系统读取 `personal_calendars.slots`
   - 自动将"有课"的格子标记为"忙碌"，其余为"空闲"
   - 用户可微调
5. 点击"提交"

**后端数据流**：
```sql
-- 校验：任务状态为 collecting，截止时间未到
SELECT status, deadline FROM tasks WHERE id = $tid;

-- 写/更新
INSERT INTO task_responses (task_id, user_id, available_slots, source)
VALUES ($tid, $uid, $slots, 'manual')
ON DUPLICATE KEY UPDATE available_slots = $slots, source = 'manual', is_valid = true;
```

**写入表**：`task_responses`
**触发副作用**：更新任务统计（COUNT 查询替代冗余字段）

---

### 流程 5：发布者生成排班方案（修复 #2，异步化修 P9）

**发布者点击"生成排班方案" → 小程序仅提交约束 → 服务端写入 schedule_jobs 异步计算**

**触发（前端）**：
```sql
-- 1. 幂等校验：已有 running 任务则直接返回已有 jobId，杜绝重复计算（修 P9）
SELECT id, status FROM schedule_jobs
WHERE task_id = $tid AND type='generate_schemes' AND status IN ('pending','running');

-- 2. 无进行中任务则新建 job；tasks.status 仍停留 reviewing，不引入 generating 枚举
INSERT INTO schedule_jobs (task_id, type, status) VALUES ($tid, 'generate_schemes', 'pending');
UPDATE tasks SET generating_job_id = $jobId WHERE id = $tid;
```

**后端数据流（云函数 schedule-engine，由 job 驱动）**：
```js
// 云函数: schedule-engine（消费 schedule_jobs）
exports.main = async (event) => {
  const { jobId } = event;
  await db.collection('schedule_jobs').doc(jobId).update({ status: 'running', progress: 10 });

  const job = await db.collection('schedule_jobs').doc(jobId).get();
  const task = await db.collection('tasks').doc(job.task_id).get();
  const { constraints, periods, date_range_start, date_range_end } = task;

  // 读取所有 valid 空闲标记，且成员必须在 group_members 中 status='active'
  // （修 P8：退出/踢人统一清理，算法只认 active 成员，杜绝软删失效）
  const responses = await db.collection('task_responses')
    .aggregate()
    .match({ task_id: job.task_id, is_valid: true })
    .lookup({ from: 'group_members', localField: 'user_id', foreignField: 'user_id', as: 'gm' })
    .match({ 'gm.group_id': task.group_id, 'gm.status': 'active' })
    .end();

  const validUserIds = responses.map(r => r.user_id);

  // 前置校验：人数不足时段提示发布者（见 8.4.3），不通过则写 error_msg + status='failed'
  const pre = preCheck(task, responses);
  if (!pre.pass) {
    await db.collection('schedule_jobs').doc(jobId).update({ status: 'failed', error_msg: JSON.stringify(pre.insufficient), finished_at: NOW() });
    await db.collection('tasks').doc(job.task_id).update({ generating_job_id: null });
    return { jobId, status: 'failed' };
  }

  // 随机抽取生成 3 套候选
  const schemes = [];
  for (let i = 0; i < 3; i++) {
    schemes.push(randomSchedule(periods, validUserIds, responses, constraints));
  }

  // 回写候选方案 + 完成 job
  await db.collection('tasks').doc(job.task_id).update({ candidate_schedules: schemes, generating_job_id: null });
  await db.collection('schedule_jobs').doc(jobId).update({ status: 'success', progress: 100, result: schemes, finished_at: NOW() });
  return { jobId, status: 'success' };
};
"""

// 随机抽取核心逻辑
function randomSchedule(periods, userIds, responses, constraints) {
  const assignments = [];
  const userShiftCount = {}; // 每人排班次数统计
  
  for (const slot of allSlots(dateRange, periods)) {
    // 找出该时段所有可值班的人
    const available = userIds.filter(uid => {
      const resp = responses.find(r => r.user_id === uid);
      return resp && resp.available_slots.some(s => s.date === slot.date && s.period_id === slot.periodId);
    });
    
    // 从可用人群中随机抽取 N 人
    const needed = constraints.slot_min_people || 1;
    const selected = shuffleArray(available).slice(0, needed);
    
    assignments.push({ date: slot.date, period_id: slot.periodId, userIds: selected });
    
    // 统计每人次数
    selected.forEach(uid => { userShiftCount[uid] = (userShiftCount[uid] || 0) + 1; });
  }
  
  return { assignments, userShiftCount };
}
```

**前端展示**：
- 右侧栏显示：每人排班总次数/总时长
- 每时段显示抽取的人员名单
- 发布者可在任意时段点击"手动调整"具体选谁

**写入表**：`tasks.candidate_schedules`（原 `tasks.final_schemes`，命名统一，修 P3）
**触发副作用**：`tasks.generating_job_id` 置空

---

### 流程 6：发布者发布排班（修复 #11 增加 adjusting）

**用户视角**：
1. 预览方案 → 可选"手动调整"具体人选
2. 点击"发布"
3. 任务进入 published 状态

**后端数据流**：
```sql
-- 1. 选定方案落库（从 candidate_schedules 取 selectedIndex），刷新分享 token
UPDATE tasks
SET final_schedule   = $selected_scheme,
    share_token      = UUID(),
    status           = 'published',
    published_at     = NOW()
WHERE id = $tid;   -- final_schedules → final_schedule（修 P3）；每次发布刷新 share_token（修 #10）

-- 生成用户日程快照
INSERT INTO user_assignments (task_id, user_id, date, period_id, period_name, group_name)
SELECT $tid, uid, date, period_id, period_name, group_name FROM ...

-- 推送"查收提醒"给所有成员
INSERT INTO notify_queue ...
SELECT 'user', user_id, 'TEMPLATE_RECEIPT', $payload, NOW()
FROM group_members WHERE group_id = $gid AND status = 'active';

-- 初始化查收状态
INSERT INTO task_receipts (task_id, user_id, receipt_status)
SELECT $tid, user_id, 'pending'
FROM group_members WHERE group_id = $gid AND status = 'active';
```

**写入表**：`tasks`, `user_assignments`, `notify_queue`, `task_receipts`
**触发副作用**：订阅消息推送"查收提醒"

---

### 流程 7：加入者查收排班（修复 #4 异议闭环）

**用户视角**：
1. 收到推送 → 点击进入 → 预览排班表
2. 底部两个按钮：
   - **确认查收** → 写入 confirmed
   - **我有异议** → 弹窗填原因 → 写入 objected → 通知发布者

**后端数据流**：
```sql
-- 确认
UPDATE task_receipts 
SET receipt_status = 'confirmed', receipt_time = NOW()
WHERE task_id = $tid AND user_id = $uid;

-- 异议
UPDATE task_receipts 
SET receipt_status = 'objected', objection_reason = $reason, receipt_time = NOW()
WHERE task_id = $tid AND user_id = $uid;

-- 通知发布者
INSERT INTO notify_queue (target_type, target_id, template_id, payload)
VALUES ('user', $publisher_id, 'TEMPLATE_OBJECTION', $payload);
```

**写入表**：`task_receipts`, `notify_queue`
**触发副作用**：若有异议，通知发布者

---

### 流程 8：发布者处理异议（修复 #4 新增流程）

**用户视角**：
1. 发布者收到"X 有异议"通知
2. 进入任务详情 → 异议列表
3. 可选操作：
   - **接受异议** → 调整方案 → 回退到 adjusting → 重新生成
   - **驳回异议** → 标记 resolved=true，不做变更

**后端数据流（接受异议 → 重新发布）**：
```sql
-- 1. 任务进入 adjusting
UPDATE tasks SET status = 'adjusting' WHERE id = $tid;

-- 2. 发布者调整 → 重新点击发布
UPDATE tasks
SET previous_schedule = final_schedule,   -- 备份上一版（adjusting 回滚用，原 previous_schemes，修 P3）
    final_schedule    = $new_schedules,   -- final_schedules → final_schedule（修 P3）
    share_token       = UUID(),            -- 刷新分享 token，旧链接失效
    status            = 'published',
    published_at      = NOW()
WHERE id = $tid;

-- 3. 重置所有成员查收状态为 pending
UPDATE task_receipts SET receipt_status = 'pending', receipt_time = NULL, resolved = false;

-- 4. 重新推送"排班已更新，请重新查收"
INSERT INTO notify_queue ...

-- 5. 归档原异议
UPDATE task_receipts SET resolved = true, resolved_at = NOW() 
WHERE task_id = $tid AND user_id = $objector_id;
```

**写入表**：`tasks`, `task_receipts`, `notify_queue`
**触发副作用**：全新推送

---

### 流程 9：发布者踢出成员（修复 #5, #6）

**用户视角**：
1. 发布者进入分组管理
2. 点击某成员右侧"踢出" → 弹窗填原因 → 二次确认

**后端数据流**：
```sql
-- 1. 权限校验
SELECT role_in_group FROM group_members 
WHERE group_id = $gid AND user_id = $operator_uid AND role_in_group = 'publisher';

-- 2. 踢出
UPDATE group_members 
SET status = 'kicked', kicked_at = NOW(), kicked_reason = $reason, is_blacklisted = $is_blacklisted
WHERE group_id = $gid AND user_id = $target_uid;

-- 3. 软删除该成员在所有未结束任务中的空闲标记
UPDATE task_responses SET is_valid = false
WHERE user_id = $target_uid 
  AND task_id IN (SELECT id FROM tasks WHERE group_id = $gid AND status IN ('collecting','reviewing','adjusting','published'));

-- 4. 从 user_assignments 快照中标记无效（保留审计链路）
UPDATE user_assignments SET is_active = false
WHERE user_id = $target_uid
  AND task_id IN (SELECT id FROM tasks WHERE group_id = $gid);

-- 5. 审计日志
INSERT INTO audit_logs (operator_id, target_type, target_id, action, reason)
VALUES ($operator_uid, 'member', $target_uid, 'kick_member', $reason);

-- 6. 若当前有已发布任务，通知发布者需重新生成方案
INSERT INTO notify_queue (target_type, target_id, template_id, payload)
SELECT 'user', $operator_uid, 'TEMPLATE_RECALC_NEEDED', $payload
WHERE EXISTS (SELECT 1 FROM tasks WHERE group_id = $gid AND status IN ('reviewing','published'));
```

**写入表**：`group_members`, `task_responses`, `user_assignments`, `audit_logs`, `notify_queue`
**触发副作用**：通知发布者可能需要重算

---

### 流程 10：非成员通过分享链接预览（修复 #10）

**用户视角**：
1. 任何人点击分享链接
2. 进入预览页
3. **只能看到姓名 + 时段，不显示手机号等敏感信息**
4. 底部两按钮：
   - **我是本组成员** → 走流程 2 加入
   - **退出预览** → 回到首页

**后端数据流**：
- 路径：`/pages/preview/preview?task_id=xxx&share_token=xxx`
- 校验 share_token 有效期（默认 7 天）
- 仅返回脱敏数据：姓名、时段、节次名称
- 不返回 phone、class_name 等敏感字段

**写入表**：无（仅展示）
**触发副作用**：无

### 10.1 share_token 生成与校验逻辑

```
生成时机：发布者点击"正式发布"时
  ↓
  token = UUID.v4()
  UPDATE tasks SET share_token = token WHERE id = $tid
  ↓
分享链接: /pages/preview/preview?task_id=$tid&share_token=$token

校验逻辑 (云函数预览接口):
  1. 查 tasks WHERE id = $tid AND share_token = $token
  2. 不存在 → 403 "无效链接"
  3. published_at + 7天 < NOW() → 410 "链接已过期"
  4. 存在且未过期 → 返回脱敏排班数据
```

> **安全要点**: 不直接用 task_id 做预览参数。share_token 绑定任务，不可遍历。
> 每次重新发布（published → adjusting → re-published）时自动刷新 share_token，旧链接失效。

---

### 流程 11：截止时间调度（countdowns 驱动，修复 #3，修 P2）

**用户视角**：
- 截止时间到达后，未提交成员收到推送"任务已截止"
- 发布者收到通知可手动关闭或延长

**后端数据流（云函数定时任务，每 30s 一次）**：
```sql
-- ① 催促提醒：target_time + notify_offset 到达且未提醒过（notify_offset 默认 -1800s，修 P2）
SELECT c.task_id, t.group_id FROM countdowns c JOIN tasks t ON t.id = c.task_id
WHERE c.status = 'pending' AND t.status = 'collecting'
  AND c.target_time + INTERVAL c.notify_offset SECOND <= NOW();

INSERT INTO notify_queue (target_type, target_id, template_id, payload, scheduled_at)
SELECT 'user', user_id, 'TEMPLATE_REMINDER', $payload, NOW()
FROM group_members WHERE group_id = $gid AND status = 'active'
  AND user_id NOT IN (SELECT user_id FROM task_responses WHERE task_id = $tid AND is_valid = true);
UPDATE countdowns SET status = 'notified' WHERE task_id = $tid;

-- ② 截止关闭：target_time 到达，collecting → reviewing（修 P2：countdowns 为唯一调度真相源）
SELECT c.task_id FROM countdowns c JOIN tasks t ON t.id = c.task_id
WHERE c.status IN ('pending','notified') AND t.status = 'collecting' AND c.target_time <= NOW();

UPDATE tasks SET status = 'reviewing' WHERE id IN (...);
UPDATE countdowns SET status = 'closed', closed_at = NOW() WHERE task_id IN (...);

-- 取消该任务尚未发出的"催促提醒"（避免截止后仍推送）
UPDATE notify_queue SET status = 'cancelled'
WHERE target_type = 'task' AND target_id IN (...) AND status = 'pending' AND template_id = 'TEMPLATE_REMINDER';
```

**写入表**：`countdowns`, `tasks`, `notify_queue`
**触发副作用**：截止前 `notify_offset` 催促提醒（P2 兑现）、截止关闭、取消冗余催促推送

---

### 流程 12：错填后发布者重开某成员（修复 #11）

**用户视角**：
1. 加入者告知发布者填错了
2. 发布者在任务详情点击某成员"重开提交"
3. 该成员收到推送，可重新填写

**后端数据流**：
```sql
-- 仅重开指定成员
UPDATE task_responses SET is_valid = false 
WHERE task_id = $tid AND user_id = $mid;

INSERT INTO notify_queue (target_type, target_id, template_id, payload)
VALUES ('user', $mid, 'TEMPLATE_REOPEN', $payload);
```

**写入表**：`task_responses`, `notify_queue`
**触发副作用**：该成员收到推送

---

## 四、任务状态机（v3.5：废弃 draft，generating 由 schedule_jobs 承载）

```
                ┌── [发布者废弃/取消] → archived (废弃)
                │
collecting ─────┤  [发布者创建任务即进入收集，废弃 draft，修 P7]
                │
                ├── [截止时间到 (countdowns 驱动)] → reviewing (等待发布者生成方案)
                │     │
                │     │     ├── [发布者点击生成方案] → (schedule_jobs: pending→running→success，tasks 仍 reviewing，修 P9)
                │     │     │         │
                │     │     │         └── [计算完成] → reviewing (候选方案就绪，可预览)
                │     │     │
                │     │     ├── [发布者确认并发布] → published (已发布)
                │     │     │         │
                │     │     │         ├── [发布者处理异议] → adjusting (调整中)
                │     │     │         │         │
                │     │     │         │         └── [调整完成] → published (重新发布)
                │     │     │         │
                │     │     │         └── [发布者手动归档] → archived (已归档)
                │     │     │
                │     │     └── [发布者延长截止] → collecting (重新收集)
                │     │
                │     └── [发布者取消] → archived (废弃)
```

### 4.1 状态职责单一化

| 状态 | 职责 | 谁触发 | 可执行操作 |
|------|------|--------|-----------|
| `collecting` | 收集空闲时间 | 发布者创建任务即进入（无 draft，修 P7） | 截止时间到(countdowns)→reviewing |
| `reviewing` | 等待/预览方案 | 截止到 / 生成完成 | 生成方案(异步, schedule_jobs) / 确认发布 / 延长截止 |
| `published` | 已发布 | 发布者确认 | 异议处理/归档 |
| `adjusting` | 处理异议中 | 发布者接受异议 | 编辑→重新发布 |
| `archived` | 已归档 | 发布者归档/废弃/取消 | 不可操作

> `generating` 已从状态枚举移除（修 P1）：生成方案期间 `tasks.status` 仍停留 `reviewing`，计算态由 `schedule_jobs` 表承载（pending→running→success/failed），前端轮询 job 即可，避免 DB 枚举约束冲突与重复计算。

---

## 五、订阅消息模板（4 个）

### 模板 1：创建提醒
```
标题：新的排班任务
内容：{{publisher_name}} 邀请了 "{{task_title}}" 排班
截止时间：{{deadline}}
跳转：/pages/task-detail/task-detail?id={{task_id}}
```

### 模板 2：收集状态提醒
```
标题：排班空闲时间提交提醒
内容："{{task_title}}" 即将于 {{deadline}} 截止，请尽快提交
跳转：/pages/task-mark/task-mark?id={{task_id}}
```

### 模板 3：查收提醒
```
标题：排班结果已发布
内容：{{publisher_name}} 已发布 "{{task_title}}" 排班结果
跳转：/pages/preview/preview?task_id={{task_id}}&token={{share_token}}
```

### 模板 4：排班更新提醒（新增）
```
标题：排班方案已更新
内容：{{publisher_name}} 更新了 "{{task_title}}" 排班方案
跳转：/pages/preview/preview?task_id={{task_id}}&token={{share_token}}
```

---

## 六、越权检查矩阵（修正后）

| 操作 | 需要权限 | 校验方式 |
|------|----------|----------|
| 创建分组 | 任何 user | openid 存在即可；role_in_group 自动 = publisher |
| 创建任务 | group publisher | `role_in_group = 'publisher'` |
| 标记空闲 | group member | `status = 'active'` |
| 查收 | group member | `status = 'active'` |
| 查看成员详情 | group publisher | 仅返回脱敏数据（不含 phone） |
| 查看成员手机号 | group publisher | 独立 API，AES 解密 + 脱敏显示（138****1234） |
| 踢人 | group publisher | `role_in_group = 'publisher'`；不能踢自己 |
| 生成方案 | group publisher | 服务端执行，非客户端 |
| 发布方案 | group publisher | 服务端校验 |
| 处理异议 | group publisher | 接受→重发；驳回→标记 resolved |
| 创建管理员 | superadmin | H5 后台验证，写入 users 表（account_type='admin'） |
| 查看审计日志 | superadmin / admin | H5 后台验证 |
| 退出分组 | group member | 复用 remove_member 清理进行中任务标记（修 P8） |
| 取消任务 | group publisher | 级联软删 task_responses/user_assignments/notify_queue |
| 封禁/解封用户 | superadmin | 落 users.status='banned'，写 audit |
| 运维登录/管理 | superadmin / admin | 账号密码体系（account_type='admin'），与小程序 openid 隔离（修 P5） |

---

## 七、隐私边界与降级闭环

### 7.0 隐私三级管控

| 阶段 | 可见范围 | 可见内容 |
|------|---------|---------|
| **标记阶段** (collecting) | 仅自己 | 自己的空闲标记，其他人标记不可见 |
| **方案预览** (reviewing) | 仅发布者 | 所有成员的标记汇总 + 生成方案 |
| **发布后** (published) | 全组成员 | 排班表：姓名 + 脱敏手机号（138****1234） |

> **微信号永不在任何地方展示或存储。**
> 微信登录仅获取 openid + 昵称，昵称作为 group_members.display_name 初始值。
> 手机号在数据库 AES-256 加密存储，发布者查看时通过独立接口解密后立即脱敏。

### 7.1 降级闭环矩阵

| 依赖 | 成功路径 | 降级路径 | 用户体验 |
|------|---------|---------|---------|
| OCR API | 腾讯云 OCR → 布局解析 → 3 种方案 | "试试手动输入"按钮 → 拖拽网格 | 不阻塞，一键切换 |
| 订阅消息 | 微信推送 → 成员收到通知 | 静默重试 3 次 → 小程序内红点 | 不丢消息，静默兜底 |
| 排班方案 | 人数充足 → 随机抽取 | 前置校验 → 发布者放宽/补人/忽略 | 不报错，给选择 |
| 云函数 | 正常调用 | 返回错误码 → 前端 toast + 重试按钮 | 可感知，可重试 |

---

## 八、系统架构（四层分离）

```
┌──────────────────────────────────────────────────┐
│             表现层 (Presentation)                  │
│  微信小程序原生 (WXML/WXSS/JS)                      │
│  TDesign WeChat 组件库                             │
│  自定义组件: 网格标记、日历视图、邀请码卡片             │
└─────────────────┬────────────────────────────────┘
                  │ HTTPS + JWT
┌─────────────────▼────────────────────────────────┐
│             接口层 (API Gateway)                    │
│  CloudBase HTTP 云函数 + 访问鉴权                    │
│  接口鉴权: JWT (openid + 角色)                       │
│  参数校验、脱敏、限流                                 │
└─────────────────┬────────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────────┐
│            服务层 (Business Logic)                  │
│  云函数聚合:                                        │
│  - user-service     (登录/资料)                    │
│  - group-service    (创建/加入/踢人)                │
│  - task-service     (任务创建/收集/排班)             │
│  - schedule-engine  (排班算法，独立云函数)            │
│  - ai-vision        (课表视觉识别，独立云函数)        │
│  - notification     (消息推送模板管理)               │
└─────────────────┬────────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────────┐
│             数据层 (Data Layer)                     │
│  CloudBase MySQL (按 2.1-2.11 表设计)               │
│  云存储: 课表图片、用户头像                           │
│  定时触发器: 每 30s 扫 countdowns 关闭任务            │
│  notify_queue: 异步推送队列                          │
└──────────────────────────────────────────────────┘
```

### 8.1 核心设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| 数据库 | CloudBase MySQL | 排班 JOIN 多，关系型最稳 |
| 算法位置 | 独立云函数 schedule-engine | 可独立升级，不影响业务 |
| 存储 | 最小化冗余 | 去 response_count，快照表读多写少 |
| 安全 | 手机号 AES-256 + 脱敏 | 预览页只返脱敏数据 |
| 审计 | audit_logs 全量记录 | H5 后台可查所有敏感操作 |
| 扩展性 | constraints JSON 预留 | 加"技能排班""连续上限"只需改算法 |

### 8.2 软删除与成员重入（专家确认）

**结论：软删除保留，物理删除不用。**

**场景演示**：
```
小红被踢出 → group_members.status = 'kicked' (不删行)
  ↓
小红再输入邀请码 → 查到 status='kicked'
  ├─ 未在黑名单 → UPDATE status='active', cleared_at=NULL（重新激活）
  └─ 在黑名单 → 提示"您已被踢出，需联系发布者"

小红主动退出 → status = 'left'
  ↓
小红再输入邀请码 → 查到 status='left'
  └─ 系统判断未拉黑 → UPDATE status='active'（重新激活）
```

**物理删除的三大危害**：
1. `task_responses` 和 `user_assignments` 的 `user_id` 变孤儿 → 排班历史显示"已失效用户"
2. `audit_logs` 的 `target_id` 无法关联 → 审计断链
3. 被踢用户拿到邀请码可悄无声息重新 INSERT → 发布者无法察觉历史

**group_members 重入逻辑伪代码**：
```sql
IF EXISTS (SELECT 1 FROM group_members WHERE group_id=$gid AND user_id=$uid) THEN
  IF status IN ('kicked','left') AND NOT is_blacklisted THEN
    UPDATE SET status='active', kicked_at=NULL, left_at=NULL;
    -- 成功重新加入，历史保留
  ELSE
    -- 拒绝，提示"需联系发布者"
  END IF;
ELSE
  INSERT INTO group_members (group_id, user_id, display_name, role_in_group, status)
  VALUES ($gid, $uid, $name, 'member', 'active');
END IF;
```

### 8.3 首页分组卡片查询流（跨分组身份切换）

```
用户进入首页
  ↓
SELECT g.id, g.name, g.invite_code, gm.role_in_group
FROM groups g
JOIN group_members gm ON g.id = gm.group_id
WHERE gm.user_id = $current_uid AND gm.status = 'active'
  ↓
返回:
  [
    { id: "G001", name: "计科202值班群", role: "publisher", invite_code: "X9K2M" },
    { id: "G002", name: "学生会值班",   role: "member",    invite_code: null }
  ]
  ↓
前端渲染卡片:
  卡片1: "计科202值班群" [发布者] [管理▶][新建任务+]
  卡片2: "学生会值班"   [成员]   [标记空闲▷]
  ↓
用户点击任意卡片 → wx.setStorageSync('activeGroupId', card.id) → 进入该分组上下文
```

### 8.4 AI 识别策略（腾讯云 OCR API）

| 层级 | 方案 | 适用场景 |
|------|------|---------|
| **云端优先** | 腾讯云通用印刷体 OCR API | 拍照/相册上传，按量付费 |
| **布局解析** | 简单规则引擎（行列关系推导） | OCR 返回文字坐标后，规则计算行列归属 |
| **本地降级** | 手动拖拽录入（personal_calendars.source='manual'） | API 失败 / 结果不可解析 |
| **模型部署** | 无本地模型，纯 API 调用 | 无需 GPU，无需 Layer |

### 8.4.1 识别流程

```
用户上传图片
  → imgSecCheck 安全审核（必须通过）
  → 云存储保存原图 (image_url)
  → 云函数 ai-vision 调用腾讯云 OCR API
       ↓
  OCR 返回: [{text: "高等数学", x: 120, y: 80}, {text: "周一", x: 200, y: 50}, ...]
       ↓
  简单规则引擎解析行列关系:
    - 按 y 坐标聚类出"行"（节次/时间段）
    - 按 x 坐标聚类出"列"（周一~周日）
    - 匹配文字内容到对应格子
       ↓
  生成 3 种可能布局方案 → 用户三选一
       ↓
  确认 → 写入 personal_calendars (source='ai_vision')
  失败 → 前端展示"试试手动输入"按钮 → 一键切换拖拽网格
```

### 8.4.2 图片安全审核

```
wx.chooseImage (仅拍照/相册，不支持聊天记录转发)
  → 云存储上传临时 URL
  → security.imgSecCheck (云调用) 
    → 通过 → 进入 AI 识别 / 云存储持久化
    → 不通过 → 提示"图片违规，请重新上传"
```

### 8.4.3 排班方案前置校验

云函数 `schedule-engine` 在生成方案前必须校验：

```javascript
function preCheck(task, responses) {
  const slots = generateAllSlots(task.date_range_start, task.date_range_end, task.periods);
  const minPeople = task.constraints.slot_min_people || 1;
  
  const insufficient = []; // 人数不足的时段
  for (const slot of slots) {
    const availableCount = responses.filter(r => 
      r.available_slots.some(s => s.date === slot.date && s.period_id === slot.periodId)
    ).length;
    
    if (availableCount < minPeople) {
      insufficient.push({ ...slot, available: availableCount, needed: minPeople });
    }
  }
  
  if (insufficient.length > 0) {
    return { pass: false, insufficient };
    // 前端提示："10月3日第1-2节只有1人可用，需要至少2人"
    // 允许发布者: (A)放宽约束 (B)手动补人 (C)忽略继续生成
  }
  return { pass: true };
}
```

---

## 九、导航与页面结构（v3.4 界面深化）

### 9.1 底部 TabBar（4 项）

| Tab 路径 | 图标 | 中文 | 功能 |
|----------|------|------|------|
| `index` | 主页(房子) | 首页 | 分组卡片列表 + 身份标签 |
| `schedule` | 日历 | 日程 | 月历视图 + 任务列表 + 快速新建 |
| `task` | 任务 | 任务 | 角色动态：发布者=创建/管理；加入者=标记/查收 |
| `profile` | 人形 | 个人中心 | 分组管理 / 历史 / 日历 / 推送设置 |

模板配置、AI 识别均为任务流二级页面，不占独立 Tab。

### 9.2 日程页（schedule）深度设计

#### 9.2.1 页面布局

```
┌─────────────────────────────────┐
│  <  September 2026  >          │ ← 顶部月份切换
├─────────────────────────────────┤
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun │ ← 星期表头（英文缩写）
├─────────────────────────────────┤
│  ┌───┬───┬───┬───┬───┬───┬───┐ │
│  │   │   │   │   │   │   │   │ │
│  │   │   │   │   │   │   │   │ │ ← 7列 × 5~6行日历网格
│  │   │   │   │   │   │   │   │ │
│  └───┴───┴───┴───┴───┴───┴───┘ │
├─────────────────────────────────┤
│  ┌─────────────────────────┐    │
│  │ ● 正在排班任务           │    │ ← 仅显示当前用户的待标记/已标记
│  │  组名 · 截止时间          │    │
│  │  提交状态：已提交/未提交    │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │ ○ 即将排班任务           │    │
│  │  组名 · 预计发布日        │    │
│  └─────────────────────────┘    │
├─────────────────────────────────┤
│  [+] 新建排班任务（仅发布者可见）  │ ← 悬浮按钮，角色权限控制
└─────────────────────────────────┘
```

#### 9.2.2 交互逻辑与数据规则

| 区域 | 规则 |
|------|------|
| 月份切换 | < > 箭头切换，中间显示年月；仅加载有排班数据的月份，无数据月份灰显不可点 |
| 日历网格 | 7列（周一~周日），行数自适应（5~6行）。有已排班任务的日期格内显示小圆点 |
| 点击日期 | 弹详情卡：自己的排班（时段、组名、地点）；发布后若有他人排班，显示姓名+脱敏手机号 |
| 正在排班任务 | 仅显示当前用户参与的 `collecting` 任务。显示组名、截止时间、自己的提交状态。成员之间严格隔离 |
| 即将排班任务 | 已发布但未到执行日期的任务，供用户预览即将参与的班次 |
| 新建任务按钮 | 仅当用户在某分组中为 `publisher` 时显示。若用户在多个分组都是 publisher，点击后弹出半屏选择器列出所有可管理分组，选择后再进入创建流程。若仅一个 publisher 身份，直接以该分组上下文进入 |

#### 9.2.3 隐私边界在日程页的体现

- **标记阶段 (collecting)**：日程页任务列表仅展示自己的提交状态，成员之间不可见。发布者也需进入任务详情看汇总
- **发布后 (published)**：日历格内点击弹详情卡，成员之间可互看姓名+脱敏手机号，不显示微信号
- **分享预览页**：始终只展示姓名+时段，无手机号

#### 9.2.4 日程页 vs 任务 Tab 职责分工

| 功能 | 日程页 (schedule) | 任务 Tab (task) |
|------|:--:|:--:|
| 查看自己某天的班次 | ✅ | — |
| 查看自己所有任务摘要 | ✅ | — |
| 标记空闲时间 | — | ✅ |
| 发布者管理任务/生成方案 | — | ✅ |
| 查收排班结果 | — | ✅ |

> 日程页专注"个人时间视图"，任务 Tab 承载操作闭环。

### 9.3 个人中心（profile 页）

```
┌───────────────────────┐
│  头像 + 昵称            │
│  我的分组列表            │  ← 可退出（二次确认 → status='left'）
│  历史排班记录            │  ← 时间轴展示，按年月筛选
│  我的日历管理            │  ← 多日历管理（personal_calendars）
│  推送设置               │  ← 订阅消息开关
│  关于小程序              │
└───────────────────────┘
```

> **退出分组** = 软删除：`UPDATE group_members SET status='left'`，历史数据全保留；并**复用与踢人一致的 `remove_member` 清理逻辑**（软删进行中任务的 `task_responses.is_valid` + `user_assignments.is_active`，修 P8），保证算法读取响应时 `JOIN group_members.status='active'` 不会把已退出成员计入。
> 再入：再次输入邀请码 → 查到 status='left' 且未拉黑 → UPDATE active，历史保留。
> 详见 流程 9.5（退出分组）。

---

## 十、低负载设计原则

1. **算法后移至云函数**：客户端只发参数，不参与计算
2. **主表只索引不冗余**：去掉 response_count，用 COUNT 查询
3. **图片/文件走云存储**：不存数据库
4. **消息队列异步**：notify_queue 定时 30s 扫一次
5. **user_assignments 快照**：发布时一次性生成，加速日程页查询
6. **历史任务归档**：status='archived' 超过 90 天自动转冷存储

---

## 十一、补充流程（v3.5 新增，覆盖审查报告 F1–F11）

> 以下流程为 v3.5 新增，补全审查报告指出的功能缺失项；接口字段详见 `api-spec.md`。

### 流程 0：发布者创建分组（修 F6）
**后端数据流**：
```sql
-- 1. 生成 6 位邀请码（碰撞重试，避免与已有冲突）
SELECT id FROM groups WHERE invite_code = $code;  -- 冲突则重新随机
-- 2. 写入分组，创建者自动为 publisher
INSERT INTO groups (name, invite_code, created_by, mode, time_config, cycle_rule, status)
VALUES ($name, $code, $uid, $mode, $time_config, $cycle_rule, 'active');
INSERT INTO group_members (group_id, user_id, display_name, role_in_group, status)
VALUES ($gid, $uid, $nickname, 'publisher', 'active');
```
**规则**：邀请码 6 位大写字母+数字；重名不限制（分组内显示名可区分）；超员由业务层判定；`time_config` 为默认班次模板（见 P4）。

### 流程 4.5：AI 识别个人日历（修 F5，异步）
**后端数据流**：
```sql
-- 1. 上传图片 → imgSecCheck 安全审核（必过）→ 云存储持久化 image_url
-- 2. 写入 schedule_jobs(type='ocr_calendar', status='pending') 返回 jobId
INSERT INTO schedule_jobs (task_id, type, status) VALUES (NULL, 'ocr_calendar', 'pending');
-- 3. 云函数 ai-vision 消费 job：OCR → 布局规则解析 → 生成 3 种布局方案 → 写 personal_calendars(source='ai_vision')
-- 4. 前端轮询 GET /jobs/{jobId} 拿 success/failed；失败降级手动拖拽
```
**降级**：OCR 失败 → 前端"试试手动输入"按钮 → 拖拽网格（personal_calendars.source='manual'）。

### 流程 9.5：成员退出分组（修 F8 / P8）
**后端数据流**：
```sql
-- 复用 remove_member：与踢人同一清理逻辑，区别仅在 status 取值
UPDATE group_members SET status = 'left', left_at = NOW() WHERE group_id = $gid AND user_id = $uid;
-- 软删进行中任务标记（与流程 9 第 3/4 步一致）
UPDATE task_responses SET is_valid = false
WHERE user_id = $uid AND task_id IN (SELECT id FROM tasks WHERE group_id = $gid AND status IN ('collecting','reviewing','adjusting','published'));
UPDATE user_assignments SET is_active = false WHERE user_id = $uid AND task_id IN (SELECT id FROM tasks WHERE group_id = $gid);
```
**规则**：退出非物理删除；再入走流程 2 重激活逻辑。

### 流程 13：发布者取消/废弃任务（修 F8）
**后端数据流**：
```sql
-- 1. 仅 publisher 可取消；级联软删
UPDATE tasks SET status = 'archived' WHERE id = $tid AND publisher_id = $uid;
UPDATE task_responses SET is_valid = false WHERE task_id = $tid;
UPDATE user_assignments SET is_active = false WHERE task_id = $tid;
UPDATE notify_queue SET status = 'cancelled' WHERE target_type='task' AND target_id = $tid AND status='pending';
```
**规则**：已发布任务也可取消；取消后成员端该任务从"正在排班/即将排班"移除。

### 流程 14：消息中心（红点兜底，修 F2）
**后端数据流**：
```sql
-- 获取我的未读通知（订阅消息失败时的站内兜底）
SELECT id, template_id, payload, created_at, is_read FROM notify_inbox
WHERE user_id = $uid AND is_read = false ORDER BY created_at DESC LIMIT 20;
-- 已读回写
UPDATE notify_inbox SET is_read = true WHERE id = $nid AND user_id = $uid;
-- 红点计数
SELECT COUNT(*) FROM notify_inbox WHERE user_id = $uid AND is_read = false;
```
> 需新增 `notify_inbox` 表（订阅消息落库副本）。与 `notify_queue`（发送队列）区分：**queue 管"发没发"，inbox 管"看没看"**（详见 2.13）。

### 流程 15：运维端登录与管理（修 F1）
- **运维登录**：`POST /api/v1/admin/login`（账号+密码，account_type='admin'，JWT 独立签发）；与小程序 openid 体系隔离（修 P5）。
- **创建管理员**：superadmin 调用，写入 users(account_type='admin', username, password_hash, role)。
- **数据大屏 / 审计 / 封禁**：H5 PC 后台，SSE 实时指标流（详见 api-spec §运维端）。
- **封禁用户**：`POST /api/v1/admin/users/{id}/ban` → users.status='banned' + audit_logs。

### 流程 16：用户注销与数据导出（PIPL 合规，修 F10）
- **注销**：`POST /api/v1/me/delete` → 逻辑删除（标记 + 异步清理关联数据），保留审计链路。
- **数据导出**：`GET /api/v1/me/export` → 返回本用户在 groups / tasks / personal_calendars / assignments 中的关联数据（JSON），履行《个人信息保护法》知情与携带权。

---

## 十二、本次修订摘要

### v3.4 → v3.5（审查修复版：逐条修改 + 根因说明）

> 本轮依据 `flow-review-report.md` 的 P1–P9（严重）、F1–F11（缺失）、G1–G11（规范）逐项修复。
> 凡涉及接口定义者，落地在 `api-spec.md`（v3.5 表结构约定已对齐）；本文档负责「流程 + 表结构 + 状态机」的一致性。

| # | 严重度 | 修改点 | 根因（审查报告） | 具体变更 |
|---|--------|--------|----------------|---------|
| 1 | 🔴 P1 | `tasks.status` 枚举 | 状态机有 `generating` 但表无 → DB 约束冲突、轮询无状态 | 枚举改为 `collecting/reviewing/adjusting/published/archived`；`generating` 由 `schedule_jobs` 承载 |
| 2 | 🔴 P3 | 排班结果字段命名 | `final_schedules`/`final_schemes`/`previous_schemes` 命名打架 → 写错列风险 | 统一为 `candidate_schedules`(多套候选) + `final_schedule`(选定) + `previous_schedule`(上一版)；全文档替换 |
| 3 | 🔴 P5 | `users` 账户模型 | 有封禁流程却无字段；admin 误写 openid（'admin_lisi'） | 新增 `account_type/status(banned)/banned_reason/username/password_hash`；微信与运维账户互斥填充，物理隔离 |
| 4 | 🔴 P7 | `draft` 状态 | 状态机照搬通用框架，无"存草稿"入口 → 死状态 | 废弃 `draft`，创建任务即 `collecting`（MVP 简化）；状态机 + 4.1 表同步删除 |
| 5 | 🔴 P2 | 截止调度 | `countdowns` 被设计却从未被消费，`notify_offset` 形同虚设 | 流程 11 重写为扫 `countdowns` 触发「催促(notify_offset)+ 关闭」；`countdowns` 成为唯一调度真相源 |
| 6 | 🟡 P4 | 分组模板归属 | `groups.time_config` 与 `tasks.periods` 映射关系缺失 | 明确 `time_config`=默认模板；创建任务 `periods` 可覆盖、不传则继承；`groups` 加 `version` |
| 7 | 🟡 P8 | 退出/踢人清理 | 退出只置 `left`，未清理进行中任务标记 → 与软删原则矛盾 | 退出复用 `remove_member`（软删 `task_responses`+`user_assignments`）；新增 流程 9.5 |
| 8 | 🔴 P9 | 异步生成状态机 | 生成方案无落点、可重复并发计算 | 新增 `schedule_jobs` 表(2.12)；流程 5 改为「建 job → 轮询」；`tasks` 加 `generating_job_id` |
| 9 | ✅ P6 | 推送跳转 token | 预览接口必填 `share_token` 但模板只传 task_id → 点推送 403 | 模板 3/4 路径已补 `&token={{share_token}}`（前轮已修，本轮确认一致） |
| 10 | 🟡 F1 | 运维端接口 | H5 端零流程/接口定义 | 新增 流程 15（登录/建管理员/大屏/审计/封禁），详细接口见 api-spec §运维端 |
| 11 | 🟡 F2 | 消息中心 | 订阅失败→红点 无落地 | 新增 流程 14 + `notify_inbox` 表(2.13)，与 `notify_queue` 职责分离 |
| 12 | 🟡 F5 | AI 识别流程 | 仅"从课表导入"无完整链路 | 新增 流程 4.5（上传→imgSecCheck→OCR→解析→3方案→确认） |
| 13 | 🟡 F6 | 创建分组 | 无流程 0 | 新增 流程 0（邀请码生成/碰撞重试/默认 publisher） |
| 14 | 🟡 F8 | 取消任务 | 状态机有废弃但无副作用定义 | 新增 流程 13（级联软删 responses/assignments/notify_queue） |
| 15 | 🟡 F10 | PIPL 注销/导出 | 无注销/导出接口 | 新增 流程 16（`me/delete` 逻辑删 + `me/export` 数据携带） |
| 16 | 🟢 G2 | 乐观锁 | 并发提交/调整互相覆盖 | `tasks`/`groups` 加 `version`，写时 `WHERE version=?` |
| 17 | 🟢 G4 | 时区 | deadline 本地 vs UTC 易错 | `tasks.deadline` 明确存 UTC，业务时区 `Asia/Shanghai` 由客户端渲染 |
| 18 | 🟢 G8 | 死字段 | `template_style` 未使用 | 标记 `nullable` + 保留扩展位（待 G8 明确语义） |
| 19 | 🟢 一致性 | 字段同步 | v3.4 残留旧字段名 | `tasks.periods` 补"不传则继承 groups.time_config"；`share_token` 发布/重发布均刷新 |

> **未在本文档展开、仅在 `api-spec.md` 落地的项**（避免重复）：F3 日历 CRUD、F4 历史查询、F7 延长截止、F9 脱敏手机号接口、F11 上传接口、G1 分页、G3 命名 `/api/v1`、G5 限流、G6 payload 结构、G7 归档机制、G9 昵称同步、G10 审计中间件、G11 双端 SSE 同步。上述均在 api-spec v3.5 中有对应接口或规范条款。

### v2.0 → v3.0 (13 项反馈全面修正)

| # | 类型 | 变更 |
|---|------|------|
| 1 | 🔴 | 邀请码绑定：去掉 wechat_suffix，强制 openid 唯一标识 |
| 2 | 🔴 | 排班算法：从客户端移至云函数，随机抽取 |
| 3 | 🔴 | 截止时间：发布者强制设定，去除随机抖动 |
| 4 | 🔴 | 异议处理：增加 adjusting 状态 + 重新发布 + 归档 |
| 5 | 🔴 | 踢人清理：软删除 task_responses (is_valid=false) + user_assignments (is_active=false) |
| 6 | 🔴 | 手机号权限：独立 API + AES 加密 + 脱敏显示 |
| 7 | 🟡 | 课表入口：手动拖拽 + "从课表导入"，合并标记页 |
| 8 | 🟡 | 日程同步：新增 user_assignments 快照表 |
| 9 | 🟡 | 身份切换：首页卡片 + 角色标签，去全局切换 |
| 10 | 🟡 | 预览隐私：预览页只显示姓名+时段，加 7 天有效期 |
| 11 | 🟢 | 状态机：增加 adjusting 和 collecting(重开) 分支 |
| 12 | 🟢 | 约束字段：tasks.constraints 新增 slot_min_people/日/周 |
| 13 | 🟢 | 计数冗余：删 response_count，用 COUNT 替代 |
| — | 🆕 | 审计日志：新增 audit_logs 表 |
| — | 🆕 | 方案生成：纯随机抽取 + 发布者可手动指定人选 |

### v3.1 → v3.2 (状态机细化 + 审计全链路 + 导航精简)

| # | 变更 |
|---|------|
| 🔴 | 状态机拆分: drafting 可编辑/废弃；reviewing/generating 职责分离 |
| 🔴 | user_assignments 改用 is_active 软删除（保留审计链路，不用物理 DELETE） |
| 🟡 | share_token 生成与校验逻辑：UUID + 7 天过期 + 重发布刷新 |
| 🟡 | AI 模型部署改为 CloudBase Layer（替代云存储加载，消除冷启动延迟） |
| 🟡 | 排班方案生成前置校验：人数不足时提示发布者（放宽/补人/忽略） |
| 🟡 | 图片上传增加 security.imgSecCheck 云调用安全审核 |
| 🟢 | 导航精简为 4 Tab：首页/日程/任务/个人中心 |
| 🟢 | 个人中心明确：分组管理（可退出再入）、历史排班、课表管理、推送设置 |
| 🟢 | 周范围：周一~周日默认，单双周 Switch，支持自定义日期 |
| 🟢 | 通知机制：4 节点（创建/截止前/发布/异议更新），关键页面引导订阅 |
| 🟢 | MVP AI：OCR API + 简单布局规则，非占位页 |

### v3.2 → v3.3 (场景泛化 + OCR API 收敛 + 隐私边界 + 降级闭环)

| # | 变更 |
|---|------|
| 🔴 | course_tables → personal_calendars，语义从"课表"泛化为"个人日历" |
| 🔴 | 放弃视觉小模型 Layer，直接用腾讯云 OCR API + 简单布局规则 |
| 🔴 | 隐私三级管控：标记阶段隔离 / 方案预览仅发布者 / 发布后脱敏可见 |
| 🔴 | 降级闭环矩阵：OCR失败→手动、推送失败→红点、方案失败→放宽/补人 |
| 🟡 | 产品定位从"校园排班"→"通用轻量协同排班平台" |
| 🟡 | tasks.periods 班次支持任意命名（早班/晚班/A班等） |
| 🟡 | week_pattern → cycle_rule，支持 weekly/odd_weekly/even_weekly/custom |
| 🟡 | 资源基线明确：1核2G CloudBase Serverless 可平滑支撑 |
| 🟢 | 图片上传仅拍照/相册，强制 imgSecCheck |

### v3.3 → v3.4 (日程页深度设计 + 界面交互)

| # | 变更 |
|---|------|
| 🆕 | 日程页完整布局：月份切换 + 星期表头 + 7×6日历网格 + 任务卡片 + 新建按钮 |
| 🆕 | 日程页交互规则：月份仅加载有数据月份、日期圆点标记、详情卡脱敏展示 |
| 🆕 | 日程页隐私规则：标记阶段任务列表仅自己可见，成员严格隔离 |
| 🆕 | 日程页 vs 任务Tab 职责分工矩阵，避免功能冗余 |
| 🟡 | TabBar 增加图标描述（房子/日历/任务/人形），强化视觉引导 |
| 🟡 | 个人中心"课表管理"→"日历管理"（personal_calendars 语义对齐） |
| 🟢 | 新建任务按钮角色权限：仅 publisher 可见 |
