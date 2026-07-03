# 排班小程序 — 13 用户真实场景模拟

> 版本: v1.0 | 日期: 2026-07-04 | 覆盖全部角色与权限边界

---

## 用户矩阵

| ID | 昵称 | 角色(users.role) | H5 运维权限 | 小程序分组身份 | 分组 |
|----|------|-----------------|------------|---|------|
| U01 | 张三 | superadmin | 全平台最高 | 不参与业务 | — |
| U02 | 李四 | admin | 运维管理 | 不参与业务 | — |
| U03 | 小明 | user | 无 | G01:publisher / G02:member | G01/G02 |
| U04 | 小红 | user | 无 | G01:member | G01 |
| U05 | 小刚 | user | 无 | G01:member(kicked) | G01 |
| U06 | 小强 | user | 无 | G01:member / G02:publisher | G01/G02 |
| U07 | 小王 | user | 无 | G02:member | G02 |
| U08 | 小丽 | user | 无 | G01:member | G01 |
| U09 | 小华 | user | 无 | G02:member(left) | G02 |
| U10 | 小赵 | user | 无 | 无（游客） | — |
| U11 | 小钱 | user | 无 | G01:member(blacklisted) | G01 |
| U12 | 小孙 | user | 无 | G01:member / G02:member / G03:publisher | G01/G02/G03 |
| U13 | 小李 | user | 无 | G03:member | G03 |

**分组清单**：
- G01（计科202值班群）：创建者=U03，6成员+1被踢+1黑名单
- G02（学生会值班）：创建者=U06，3成员+1已退出
- G03（实验室值班）：创建者=U12，1成员

---

## 场景 1：超管管理运维账号（U01 张三）

**用户操作**：
1. 张三在 H5 后台 (React+Antd Pro) 输入账号密码登录 → 通过（users.role='superadmin'）
2. 进入"用户管理"→ 点击"创建管理员"
3. 填写：账号=lisi_admin，密码=******，角色=admin
4. 点击确认

**数据库变化**：
```sql
INSERT INTO users (openid, nickname, role) VALUES ('admin_lisi', '李四', 'admin');
INSERT INTO audit_logs (operator_id, target_type, target_id, action) VALUES (U01, 'user', U02, 'create_admin');
```

**预期效果**：李四可以用该账号密码登录 H5 后台，拥有运维管理权限（数据大屏/审计/用户管理），但比超管少"创建管理员"权限。

---

## 场景 2：运维管理数据大屏（U02 李四）

**用户操作**：
1. 李四登录 H5 → 进入"数据大屏"
2. 看到：总分组数 3、总用户数 10、活跃任务 2、今日排班 5 人次
3. 进入"审计日志"→ 按时间筛选 → 看到张三创建自己那条记录
4. 进入"可视化配置"→ 拖拽配置默认班次模板（早班/晚班/行政班）

**数据库变化**：
```sql
-- 仅查询，无写入
SELECT COUNT(*) FROM groups WHERE status='active';
SELECT COUNT(*) FROM user_assignments WHERE date=CURDATE() AND is_active=true;
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50;
```

**预期效果**：运维后台一切查询只读。李四不能修改用户的分组数据（role_in_group 在小程序端由 publisher 控制），边界明确。

---

## 场景 3：发布者创建分组并邀请（U03 小明）

**用户操作**：
1. 小明首次打开小程序 → 微信授权 → users 表写入 openid
2. 首页看到两个入口：【创建分组】【输入邀请码】
3. 点击【创建分组】→ 填写"计科202值班群"→ 选择"模板化班次"→ 点击创建
4. 系统生成邀请码"X9K2M"，弹出分享卡片
5. 点击【分享到微信群】

**数据库变化**：
```sql
INSERT INTO groups (name, invite_code, cycle_rule, created_by) VALUES ('计科202值班群', 'X9K2M', 'weekly', U03);
INSERT INTO group_members (group_id, user_id, display_name, role_in_group) VALUES (G01, U03, '小明', 'publisher');
```

**预期效果**：
- 小明在 G01 中是 publisher，拥有该分组内全部管理权限
- 邀请码"X9K2M"绑定到 G01，其他人输入后可加入
- 小明首页卡片出现"计科202值班群 [发布者]"

---

## 场景 4：通过邀请码加入（U04 小红）

**用户操作**：
1. 小红点击群里的分享卡片 → 小程序打开并预填邀请码"X9K2M"
2. 系统自动读取微信昵称"小红"，小红可修改 display_name
3. 点击【加入】

**数据库变化**：
```sql
SELECT * FROM groups WHERE invite_code='X9K2M' AND status='active';
-- 校验 group_members 中不存在 (G01, U04) → INSERT
INSERT INTO group_members (group_id, user_id, display_name, role_in_group) VALUES (G01, U04, '小红', 'member');
```

**预期效果**：
- 小红首页出现"计科202值班群 [成员]"
- 小红在 G01 中只有 member 权限（标记空闲/查收/异议）
- 小红看不到其他成员的标记数据

---

## 场景 5：发布任务并收集空闲时间（U03→U04/U08）

**小明操作**：
1. 点击 G01 卡片 → 进入分组详情 → 点击【+ 新建排班任务】
2. 填写："国庆假期值班"，10月1日-7日，截止今晚 23:59，每时段最少 1 人
3. 点击【发布任务】

```sql
INSERT INTO tasks (group_id, title, date_range_start, date_range_end, deadline, constraints, status, publisher_id)
VALUES (G01, '国庆假期值班', '2026-10-01', '2026-10-07', '2026-10-01 23:59:00', '{"slot_min_people":1}', 'collecting', U03);
INSERT INTO notify_queue ... -- 推送"创建提醒"给 U04,U06,U08
```

**小红操作**：
1. 收到订阅消息 → 点击进入小程序
2. 在任务标记页，拖拽标记 10月1-3日空闲
3. 点击【提交】

```sql
INSERT INTO task_responses (task_id, user_id, available_slots, source, is_valid)
VALUES (T001, U04, '[{"date":"2026-10-01","period_id":"p1"},...]', 'manual', true);
```

**小丽操作**：
同样的流程提交了自己的空闲时间。

**预期效果（标记阶段隐私隔离）**：
- 小红只能看到自己的提交状态（"已提交"）
- 小红看不到小丽的标记，小丽也看不到小红的
- 即使发布者小明，在日程页也看不到他人标记（需进任务详情看汇总）

---

## 场景 6：生成方案并发布（U03 小明）

**小明操作**：
1. 截止时间到 → 任务进入 reviewing
2. 小明进入任务详情 → 看到提交进度 5/6
3. 点击【生成排班方案】
4. 云函数运行：随机抽取 → 返回 3 套方案
5. 小明预览方案 2，点击某时段【手动调整】→ 把小强拖到 10月1日早班
6. 点击【正式发布】

**数据库变化**：
```sql
-- 云函数写入
UPDATE tasks SET final_schemes='[方案1,方案2,方案3...]', status='reviewing' WHERE id=T001;
-- 小明确认后
UPDATE tasks SET status='published', final_schemes='[选定的方案]', share_token='uuid-xxx', published_at=NOW();
-- 快照
INSERT INTO user_assignments (task_id, user_id, date, period_id, ...) VALUES ...;
-- 查收状态
INSERT INTO task_receipts (task_id, user_id, receipt_status) VALUES (T001, U04, 'pending'), (T001, U06, 'pending'), ...;
-- 通知
INSERT INTO notify_queue ... -- "查收提醒"
```

**预期效果（发布后隐私开放）**：
- 所有 G01 成员可在日历中看到排班表：姓名 + 脱敏手机号
- 小明查看成员详情 → 调用独立接口 → 返回"小强 138****1234"（脱敏）
- 微信号在任何地方都不展示

---

## 场景 7：小刚被踢出后的数据残留测试（U05 小刚 → 再尝试加入）

**被踢流程**：
1. 小明在分组管理点击小刚 →【踢出】→ 填"长期不配合"→ 二次确认
```sql
UPDATE group_members SET status='kicked', kicked_at=NOW(), kicked_reason='长期不配合' WHERE group_id=G01 AND user_id=U05;
UPDATE task_responses SET is_valid=false WHERE user_id=U05 AND task_id IN (SELECT id FROM tasks WHERE group_id=G01 AND status IN ('collecting','published'));
UPDATE user_assignments SET is_active=false WHERE user_id=U05 AND task_id IN (SELECT id FROM tasks WHERE group_id=G01);
INSERT INTO audit_logs (operator_id, target_type, target_id, action, reason) VALUES (U03, 'member', U05, 'kick_member', '长期不配合');
```

**再试加入**：
1. 小刚再次打开小程序 → 输入邀请码"X9K2M"
2. 后端查到 (G01, U05) 存在且 status='kicked'，未被拉黑
3. 允许重新加入：
```sql
UPDATE group_members SET status='active', kicked_at=NULL, kicked_reason=NULL WHERE group_id=G01 AND user_id=U05;
```

**预期效果**：
- 小刚重新出现在 G01 成员列表中（role='member'）
- 之前的 task_responses（is_valid=false）已被标记无效，不参与当前排班
- 之前 user_assignments（is_active=false）在日历中灰显或隐藏
- audit_logs 完整记录踢出→再入全链路
- 发布者小明可以看到小刚曾被踢出的历史

---

## 场景 8：黑名单用户被拒绝（U11 小钱）

**踢人时勾选了"加入黑名单"**：
```sql
UPDATE group_members SET status='kicked', is_blacklisted=true WHERE group_id=G01 AND user_id=U11;
```

**再试加入**：
1. 小钱输入邀请码"X9K2M"
2. 查到 status='kicked' AND is_blacklisted=true
3. 返回："您已被踢出，需联系发布者解除黑名单"

**预期效果**：小钱不能重新加入。只有发布者手动解除黑名单后（is_blacklisted=false），小钱才能再入。

---

## 场景 9：主动退出后重新加入（U09 小华）

**退出操作**：
1. 小华在 G02 的"我的分组"→ 点击【退出分组】→ 弹窗二次确认 → 确认
```sql
UPDATE group_members SET status='left', left_at=NOW() WHERE group_id=G02 AND user_id=U09;
```

**再试加入**：
1. 小华再次输入 G02 的邀请码
2. 查到 (G02, U09) 存在且 status='left'
3. 允许重新加入：
```sql
UPDATE group_members SET status='active', left_at=NULL WHERE group_id=G02 AND user_id=U09;
```

**预期效果**：小华无缝回到 G02，历史标记若有效可继续使用。

---

## 场景 10：异议处理闭环（U04 小红 → U03 小明）

**提出异议**：
1. 小红收到查收提醒 → 进入预览页 → 发现自己被排在 10月4日（那天有事）
2. 点击【我有异议】→ 输入："10月4日回老家，请换人"→ 提交
```sql
UPDATE task_receipts SET receipt_status='objected', objection_reason='10月4日回老家' WHERE task_id=T001 AND user_id=U04;
INSERT INTO notify_queue ... -- 通知 U03
```

**小明处理**：
1. 收到通知 → 进入任务详情 → 异议管理 → 看到小红的申请
2. 点击【接受异议，调整方案】
```sql
UPDATE tasks SET status='adjusting', previous_schemes=final_schemes WHERE id=T001;
```
3. 小明把小红换下，换上小强 → 点击【重新发布】
```sql
UPDATE tasks SET status='published', final_schemes='[新方案]', share_token='new-uuid-xxx', published_at=NOW();
UPDATE task_receipts SET receipt_status='pending', receipt_time=NULL WHERE task_id=T001; -- 全员重置
UPDATE task_receipts SET resolved=true, resolved_at=NOW() WHERE task_id=T001 AND user_id=U04; -- 归档异议
INSERT INTO notify_queue ... -- "排班已更新，请重新查收"
```

**预期效果**：
- 所有人的查收状态重置为 pending，需要重新确认
- 旧分享链接失效（share_token 已刷新），新链接生效
- 小红那条异议被标记为 resolved=true
- 上一版方案保存在 previous_schemes 中可回溯

---

## 场景 11：跨分组多身份（U12 小孙 = 三组三身份）

**小孙同时是**：
- G01（计科202）的 member——参与排班，标记空闲
- G02（学生会）的 member——参与排班，标记空闲
- G03（实验室）的 publisher——创建任务，管理成员

**首页展示**：
```
┌──────────────────────────┐
│ 计科202值班群      [成员] │ → 点击进入标记/查收界面
├──────────────────────────┤
│ 学生会值班          [成员] │ → 点击进入标记/查收界面
├──────────────────────────┤
│ 实验室值班        [发布者]  │ → 点击进入管理界面 [+新建任务]
└──────────────────────────┘
```

**数据库查询**：
```sql
SELECT g.id, g.name, gm.role_in_group
FROM groups g JOIN group_members gm ON g.id = gm.group_id
WHERE gm.user_id = U12 AND gm.status = 'active';
```

**预期效果**：
- 首页 3 张卡片，各自独立显示角色
- 点击哪张进入哪个分组上下文，权限完全隔离
- 不需要顶部下拉切换（之前的设计已废弃）

---

## 场景 12：游客流程（U10 小赵 = 无分组）

**小赵首次打开小程序**：
1. 微信授权 → users 表写入
2. 首页显示空状态：
```
┌─ 暂无分组 ──────────────────┐
│                              │
│  🏠 创建你自己的排班分组       │
│  [创建分组]                   │
│                              │
│  📩 已经有邀请码？             │
│  [输入邀请码加入]              │
└──────────────────────────────┘
```
3. 小赵点击【输入邀请码】→ 输入 X9K2M → 加入 G01

**预期效果**：从游客无缝变为 G01 的 member，首页出现"计科202值班群 [成员]"卡片。

---

## 场景 13：超管越权边界验证（U01 张三）

**尝试越权操作（预期全部被拦截）**：

| 操作 | 结果 |
|------|------|
| 张三尝试在小程序端查看 G01 成员手机号 | ❌ 接口校验：U01 不在 group_members 中，role=NULL，拒绝 |
| 张三尝试 H5 点击"修改小明的分组数据" | ❌ H5 不显示分组级别的增删改入口，运维只能看不能改 |
| 张三在 H5 封禁某个用户 | ✅ 超管权限允许，写入 audit_logs |
| 张三在 H5 查看全平台审计日志 | ✅ 超管权限允许 |
| 张三试图在小程序加入任意分组 | ✅ 可以（他就是普通 user 身份在小程序端） |

**预期效果**：超管只能通过 H5 运维端管理系统级别的操作（封号/查看/配置），不能越权干预分组的业务数据。

---

## 权限矩阵总览

| 用户 | Superadmin | Admin | Publisher (多少个) | Member (多少个) | 可踢人 | 可看脱敏手机号 | 可查审计 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| U01 张三 | ✅ | — | — | — | — | — | ✅ |
| U02 李四 | — | ✅ | — | — | — | — | ✅ |
| U03 小明 | — | — | G01 | G02 | ✅(仅G01) | ✅(仅G01) | — |
| U04 小红 | — | — | — | G01 | — | — | — |
| U06 小强 | — | — | G02 | G01 | ✅(仅G02) | ✅(仅G02) | — |
| U12 小孙 | — | — | G03 | G01,G02 | ✅(仅G03) | ✅(仅G03) | — |
| U10 小赵 | — | — | — | — | — | — | — |

---

## 关键边界验证总结

1. **标记阶段隔离**：U04 看不到 U08 的标记，U08 也看不到 U04 的（已在前端+接口双重隔离）
2. **发布后脱敏**：发布后所有成员可互看姓名+脱敏手机号，但微信号永不展示
3. **软删除全链路**：踢出/退出均保留记录，支持二次加入、审计追溯
4. **越权不可行**：没有 role_in_group 的用户无法访问该分组任何接口
5. **跨分组无串扰**：U12 在 G01 是 member → 不能踢 G01 的人（role='member'不是 publisher）
6. **运维只管理不干预**：U01/U02 在 H5 端管理系统级操作，不接触分组业务数据
