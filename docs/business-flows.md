# 排班小程序 — 完整业务流程文档 v3.1

> 版本: v3.1 | 日期: 2026-07-04 | 10 幕推演 + 架构深化 + 软删除确认

---

## 一、术语定义（修正后）

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
- openid (varchar(64), unique, indexed)        -- 微信 openid，唯一身份标识
- unionid (varchar(64), nullable)               -- 微信 unionid
- nickname (varchar(64))                         -- 微信昵称
- avatar_url (varchar(255))                      -- 头像 URL
- role (enum: 'superadmin', 'admin', 'user', default 'user')
- created_at, updated_at
索引：openid 唯一索引
```

### 2.2 groups（分组表）
```
字段：
- id (PK)
- name (varchar(100))
- invite_code (varchar(6), unique, indexed)
- created_by (bigint, FK->users.id, indexed)     -- 创建者 = 发布者
- mode (enum: 'timeline', 'shift', 'custom', default 'shift')
- time_config (json)                              -- 节次/时间段 JSON
- week_pattern (enum: 'natural', 'odd', 'even', default 'natural')
- status (enum: 'active', 'archived', default 'active')
- created_at, updated_at
索引：invite_code 唯一索引, created_by 索引
```

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
- week_pattern (enum: 'natural', 'odd', 'even', default 'natural')
- template_style (tinyint)                        -- 样式 1/2/3
- periods (json)                                  -- 节次定义 [{id, name, start, end}]
- constraints (json)                               -- 排班约束
  {
    "slot_min_people": 1,                         -- 每时段最少值班人数
    "max_shifts_per_week": null,                  -- 每人每周最大次数（null=不限）
    "max_shifts_per_day": null                    -- 每人每天最大次数（null=不限）
  }
- deadline (datetime)                              -- 截止时间（发布者设定，无随机偏移）
- status (enum: 'draft', 'collecting', 'reviewing', 'adjusting', 'published', 'archived')
- publisher_id (bigint, FK->users.id)             -- 发布者
- selected_scheme_id (bigint, nullable)
- final_schedules (json)                           -- 当前排班结果
- previous_schemes (json, nullable)                -- 上一版排班结果（adjusting 回滚用）
- share_token (varchar(64), nullable, indexed)     -- 分享预览 token（7天有效）
- created_at, updated_at, published_at
索引：(group_id, status), publisher_id, deadline, share_token
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

### 2.6 course_tables（用户课表，支持手动+视觉识别双入口）
```
字段：
- id (PK)
- user_id (bigint, FK->users.id, indexed)
- source (enum: 'manual', 'ai_vision', default 'manual')  -- 录入来源
- image_url (varchar(255), nullable)               -- AI 识别时上传的原图
- semester_name (varchar(100))                      -- 学期名称
- week_pattern (enum: 'current', 'odd', 'even', default 'current')
- slots (json)                                       -- 课表数据
  [{day_of_week: 1, periods: [1,2,3], name: "高等数学", location: ""}]
- ai_confidence (decimal(3,2), nullable)             -- AI 识别置信度（仅 source='ai_vision'）
- created_at, updated_at
索引：user_id 索引
```

> **AI 识别策略**：接入轻量视觉小模型（如微信 WeCLIP 或 MiniCPM-V），
> 上传课表图片后云端 OCR + 布局分析 → 返回 3 种样式方案 → 用户三选一确认。
> 识别失败时降级为手动拖拽录入，不阻塞用户。

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
- created_at
索引：(user_id, date) 联合索引
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
  week_pattern, periods, constraints, deadline, status, publisher_id)
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
   - 系统读取 `course_tables.slots`
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

### 流程 5：发布者生成排班方案（修复 #2）

**发布者点击"生成排班方案" → 小程序仅提交约束 → 云函数异步计算**

**后端数据流（云函数）**：
```js
// 云函数: generate-scheduling-schemes
exports.main = async (event) => {
  const { taskId } = event;
  
  // 1. 读取任务约束
  const task = await db.collection('tasks').doc(taskId).get();
  const { constraints, periods, date_range_start, date_range_end } = task;
  
  // 2. 读取所有 valid 的空闲标记
  const responses = await db.collection('task_responses')
    .where({ task_id: taskId, is_valid: true })
    .get();
  
  // 3. 排除已被踢出的成员
  const validUserIds = responses.map(r => r.user_id);
  
  // 4. 随机抽取算法
  const schemes = [];
  for (let i = 0; i < 3; i++) {
    schemes.push(randomSchedule(periods, validUserIds, responses, constraints));
  }
  
  // 5. 写回
  return schemes;
};

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

**写入表**：`tasks.final_schemes`
**触发副作用**：无

---

### 流程 6：发布者发布排班（修复 #11 增加 adjusting）

**用户视角**：
1. 预览方案 → 可选"手动调整"具体人选
2. 点击"发布"
3. 任务进入 published 状态

**后端数据流**：
```sql
UPDATE tasks SET status = 'published', published_at = NOW() WHERE id = $tid;

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
UPDATE tasks SET status = 'published', final_schedules = $new_schedules, published_at = NOW();

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
SET status = 'kicked', kicked_at = NOW(), kicked_reason = $reason
WHERE group_id = $gid AND user_id = $target_uid;

-- 3. 软删除该成员在所有未结束任务中的空闲标记
UPDATE task_responses SET is_valid = false
WHERE user_id = $target_uid 
  AND task_id IN (SELECT id FROM tasks WHERE group_id = $gid AND status IN ('collecting','reviewing','adjusting','published'));

-- 4. 从 user_assignments 快照中移除
DELETE FROM user_assignments 
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

---

### 流程 11：截止时间到达（修复 #3）

**用户视角**：
- 截止时间到达后，未提交成员收到推送"任务已截止"
- 发布者收到通知可手动关闭或延长

**后端数据流（云函数定时任务，每 30s 一次）**：
```sql
-- 找所有到期任务
SELECT id FROM tasks 
WHERE status = 'collecting' AND deadline <= NOW();

-- 关闭
UPDATE tasks SET status = 'reviewing' WHERE id IN (...);
```

**写入表**：`tasks`
**触发副作用**：通知发布者；取消未发送的催促提醒

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

## 四、任务状态机（修复 #11）

```
draft (草稿)
  └─→ collecting (收集中)                            [发布者点击发布]
        ├─→ reviewing (审核中/方案生成中)              [截止时间到]
        │     ├─→ published (已发布)                  [发布者确认并发布]
        │     │     ├─→ adjusting (调整中)            [发布者处理异议]
        │     │     │     └─→ published (重新发布)     [调整完成]
        │     │     └─→ archived (已归档)              [发布者手动归档]
        │     └─→ collecting (重新收集)                [发布者延长截止]
        └─→ archived (取消)                            [发布者取消任务]
```

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
跳转：/pages/preview/preview?id={{task_id}}
```

### 模板 4：排班更新提醒（新增）
```
标题：排班方案已更新
内容：{{publisher_name}} 更新了 "{{task_title}}" 排班方案
跳转：/pages/preview/preview?id={{task_id}}
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
| 创建管理员 | superadmin | H5 后台验证，写入 users 表 |
| 查看审计日志 | superadmin / admin | H5 后台验证 |

---

## 七、系统架构（四层分离）

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

### 7.1 核心设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| 数据库 | CloudBase MySQL | 排班 JOIN 多，关系型最稳 |
| 算法位置 | 独立云函数 schedule-engine | 可独立升级，不影响业务 |
| 存储 | 最小化冗余 | 去 response_count，快照表读多写少 |
| 安全 | 手机号 AES-256 + 脱敏 | 预览页只返脱敏数据 |
| 审计 | audit_logs 全量记录 | H5 后台可查所有敏感操作 |
| 扩展性 | constraints JSON 预留 | 加"技能排班""连续上限"只需改算法 |

### 7.2 软删除与成员重入（专家确认）

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

### 7.3 首页分组卡片查询流（跨分组身份切换）

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

### 7.4 AI 视觉识别模型策略

| 层级 | 方案 | 适用场景 |
|------|------|---------|
| **云端优先** | 云函数调用视觉小模型（WeCLIP/MiniCPM-V） | 正常网络环境，3-5 秒返回 |
| **本地降级** | 手动拖拽录入（course_tables.source='manual'） | 识别失败/无网络时 |
| **模型路径** | 模型文件存云存储，云函数通过 `require` 路径加载 | 本地不需下载模型 |

```
AI 识别流程:
  [用户上传课表图片]
    → 云存储保存原图 (image_url)
    → 云函数 ai-vision:
        1. OCR 文字识别（腾讯云 OCR API）
        2. 布局分析（视觉小模型定位行列关系）
        3. 输出 3 种样式方案
    → 成功: 返回方案 → 用户三选一 → 写入 course_tables (source='ai_vision')
    → 失败: 降级提示 → 用户手动拖拽 → 写入 course_tables (source='manual')
```

---

## 八、低负载设计原则

1. **算法后移至云函数**：客户端只发参数，不参与计算
2. **主表只索引不冗余**：去掉 response_count，用 COUNT 查询
3. **图片/文件走云存储**：不存数据库
4. **消息队列异步**：notify_queue 定时 30s 扫一次
5. **user_assignments 快照**：发布时一次性生成，加速日程页查询
6. **历史任务归档**：status='archived' 超过 90 天自动转冷存储

---

## 九、本次修订摘要

### v2.0 → v3.0 (13 项反馈全面修正)

| # | 类型 | 变更 |
|---|------|------|
| 1 | 🔴 | 邀请码绑定：去掉 wechat_suffix，强制 openid 唯一标识 |
| 2 | 🔴 | 排班算法：从客户端移至云函数，随机抽取 |
| 3 | 🔴 | 截止时间：发布者强制设定，去除随机抖动 |
| 4 | 🔴 | 异议处理：增加 adjusting 状态 + 重新发布 + 归档 |
| 5 | 🔴 | 踢人清理：软删除 task_responses (is_valid=false) + 清 user_assignments |
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

### v3.0 → v3.1 (10 幕推演 + 架构深化)

| # | 变更 |
|---|------|
| 🆕 | tasks 新增 `previous_schemes`（adjusting 回滚备份）+ `share_token`（预览安全） |
| 🆕 | 系统架构四层分离（表现层/接口层/服务层/数据层）|
| 🆕 | 软删除重入逻辑正式确认：`kicked/left → 查黑名单 → UPDATE active` |
| 🆕 | 首页卡片查询流：`groups JOIN group_members` 返回角色标签 |
| 🆕 | AI 视觉识别策略：云端视觉小模型 + 手动拖拽降级，模型存云存储路径加载 |
| 🔧 | group_members 唯一索引确认：(group_id, user_id) 联合唯一 |
| 🔧 | task_responses 唯一索引确认：(task_id, user_id) 联合唯一 |
