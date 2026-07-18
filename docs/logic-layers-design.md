# 排班协同 · 逻辑分层设计 v1

> 日期：2026-07-18  
> 角色主视角：**发布者（publisher）**；加入者仅作对偶层标注  
> 依据：`business-flows.md` v3.5 · `logic-data-chain-optimization.md` · `api-spec.md` · `app.wxss` v4  
> 配套交互：`.claude/skills/publisher-interaction-spec`（每页三层规格）  
> 配套视觉：`.claude/skills/weui-miniprogram-ui`（Duty Grid 签名）

---

## 0. 锚定

| 项 | 内容 |
|----|------|
| 产品唯一价值 | 发布者组织一群人，在可配置时间模板上完成「收集空闲 → 生成方案 → 公示班表」 |
| 本文件范围 | **逻辑层**定义：边界、输入输出、状态机、依赖表/API、页面归属 |
| 非目标 | 不写 H5 运维端实现细节；不在此展开每个按钮 TC（见各页三层规格） |
| 设计原则 | 单一职责 / 写路径事务边界 / 按钮=状态机边 / 失败可解释 / 软删除 |

---

## 1. 总览：七层逻辑 + 横切

```
┌─────────────────────────────────────────────────────────────┐
│ L6  通知与个人中心 Notification & Profile                      │
├─────────────────────────────────────────────────────────────┤
│ L5  公示与异议 Publish / Receipt / Objection                   │
├─────────────────────────────────────────────────────────────┤
│ L4  方案生成与预览 Scheme Generation & Preview                 │
├─────────────────────────────────────────────────────────────┤
│ L3  任务与空闲收集 Task & Availability Collection              │
├─────────────────────────────────────────────────────────────┤
│ L2  班次模板与规则 Template (Duty Grid) & Rules                │
├─────────────────────────────────────────────────────────────┤
│ L1  分组与成员 Group & Members                                 │
├─────────────────────────────────────────────────────────────┤
│ L0  身份与会话 Identity & Session                              │
└─────────────────────────────────────────────────────────────┘
         ↕ 横切 X1 请求通道 · X2 权限 · X3 一致性 · X4 配置
```

**依赖方向**：上层只依赖下层；写操作禁止跨层「跳过领域校验」直接改表。

**发布者主路径（层串联）**

```
L0 登录 → L1 创建分组 → L2 选样式/配模板/规则 → L1 分享邀请
       → L3 创建任务(collecting) →（成员填报，发布者审阅）
       → L4 生成方案 → 预览确认
       → L5 公示 → 异议处理
       → L6 消息/个人设置
```

---

## 2. 各逻辑层设计

---

### L0 · 身份与会话（Identity & Session）

| 项 | 定义 |
|----|------|
| **唯一核心任务** | 建立稳定的微信用户会话（JWT），供后续写操作鉴权 |
| **边界内** | `wx.login`、code2session、users UPSERT、token 存取、静默/显式登录、封禁拦截 |
| **边界外** | 分组角色、业务表单 |
| **关键实体** | `users`（account_type=wechat） |
| **状态** | `tokenReady: false\|true`；`user.status: normal\|banned` |
| **输入** | wx code、可选用户信息 |
| **输出** | JWT、脱敏 user、tokenReady |

**主链路**

```
App.onLaunch → silentLogin
  POST /auth/miniprogram/login { code }
  → users UPSERT(openid)
  → JWT → storage
  失败：tokenReady=false，不挡浏览；写操作 ensureLogin 再试
显式登录（我的页点击）：合规获取昵称头像 → login + PATCH /users/me
```

**页面归属**

| 页面 | 角色侧重 |
|------|----------|
| `auth` | 首次/强制授权 |
| `profile` | 显式登录 / 切换 |

**发布者页前置**：任何写按钮 `ensureLogin`；banned → 统一拦截 Toast「账号不可用」。

**边界拦截**

| 条件 | 处理 |
|------|------|
| touristappid / 无 SECRET | 开发假 openid 或 Toast 指引配置（见 logic-data-chain §0） |
| 401 | 清 token → 重登一次 → 仍失败 Toast |
| banned | 全写接口 403 |

**下层依赖**：无。  
**被依赖**：全部上层。

---

### L1 · 分组与成员（Group & Members）

| 项 | 定义 |
|----|------|
| **唯一核心任务（发布者）** | 创建并维持一个可邀请的排班容器（分组），管理成员生命周期 |
| **边界内** | 建组、邀请码、加入/重入、踢人、拉黑、退出、成员列表、分组详情聚合 |
| **边界外** | 班次格子内容、任务填报、方案算法 |
| **关键实体** | `groups`、`group_members` |
| **发布者判定** | `group_members.role_in_group = publisher` 且 `status=active` |

**状态（成员）**

```
active ⇄ left
active → kicked（可 is_blacklisted）
blacklisted → 禁止 join 重入
```

**状态（分组）**

```
active → archived
```

**主写路径**

| 动作 | API（示意） | 写表 |
|------|-------------|------|
| 创建分组 | `POST /groups` | groups + group_members(publisher) |
| 加入 | `POST /groups/join` | group_members active / 重入 |
| 踢人 | `DELETE /groups/{id}/members/{uid}` | status=kicked |
| 退出 | `POST /groups/{id}/leave` | status=left |
| 列表 | `GET /groups` | 读 JOIN active |

**页面归属（发布者）**

| 页面 | 本层核心任务 |
|------|----------------|
| `index`（部分） | 展示我的分组入口；创建/加入入口 |
| `style-select` 前序建组向导 | 建组元数据 |
| `share-preview` | 展示邀请码并分享 |
| `group-detail` | 分组驾驶舱（跳 L2/L3） |
| `members` | 成员管理 |

**页面级唯一任务（供后续三层规格）**

| 页面 | 唯一核心任务 |
|------|----------------|
| index（发布者心智） | 找到或创建要管理的分组 |
| share-preview | 把邀请码送达潜在成员 |
| group-detail | 进入本分组的任务或配置 |
| members | 维持成员集合合法（踢/黑名单） |

**边界拦截**

| 规则 | UI/行为 |
|------|---------|
| 非 publisher 踢人 | 403 + Toast |
| 踢自己 | 禁止 |
| 黑名单再加入 | 业务失败文案 |
| 进行中任务时退出 | 业务码限制（如 1206） |

---

### L2 · 班次模板与规则（Template & Rules）— **Duty Grid 签名层**

| 项 | 定义 |
|----|------|
| **唯一核心任务（发布者）** | 为分组定义「可排的时间格子」与生成约束 |
| **边界内** | 三样式（时间轴/节次/自定义）、模板编辑、分组 `time_config`、排班规则、AI 识课表（旁路） |
| **边界外** | 具体任务实例、谁填了哪格、方案求解 |
| **关键字段** | `groups.mode`、`groups.time_config`、规则配置（可在 groups 扩展或独立表） |
| **签名 UI** | **Duty Grid**：星期 × 节次/时间段 |

**模式枚举**

| mode | 页面 | 格子语义 |
|------|------|----------|
| timeline | `cal-edit-time` | 连续时间段行 |
| shift/period | `cal-edit-period` | 节次/班次行 |
| custom | `cal-edit-custom` | 可配置维度 |

**主写路径**

| 动作 | API（示意） | 写 |
|------|-------------|-----|
| 保存模板 | `PATCH /groups/{id}/time-config` 或建组时写入 | groups.time_config, mode |
| 保存规则 | `PATCH /groups/{id}/rules` | 规则 JSON |
| OCR | `POST /calendar/ocr` → job | schedule_jobs 类异步 |

**页面归属**

| 页面 | 唯一核心任务 |
|------|----------------|
| `style-select` | 选定一种格子语义（mode） |
| `cal-edit-time` | 编辑时间轴模板 |
| `cal-edit-period` | 编辑节次模板 |
| `cal-edit-custom` | 编辑自定义字段/格子 |
| `schedule-rules` | 设定生成约束（上限/连班等） |

**与 L3 关系**：创建任务时 `tasks.periods` **继承** `groups.time_config`，可覆盖；不传则继承（business-flows P4）。

**边界拦截**

| 规则 | 时机 |
|------|------|
| 时段 end≤start | 保存模板 |
| 节次空列表 | 禁止保存 |
| 规则上限 <1 | 禁止保存 |
| OCR 失败 | 回退手改，不阻断建组 |

---

### L3 · 任务与空闲收集（Task & Collection）

| 项 | 定义 |
|----|------|
| **唯一核心任务（发布者）** | 发起一轮收集，使足够成员提交空闲，达到可生成 |
| **边界内** | 创建任务、收集期、填报进度、审阅填写、代填/预置、取消任务 |
| **边界外** | 求解算法、最终 assignments |
| **关键实体** | `tasks`、`task_responses` |
| **任务状态（收集段）** | `collecting` →（取消）`cancelled/archived`；或进入 L4 |

**状态机（任务 · 全量，本层主责 collecting）**

```
collecting ──generate──► generating / reviewing
    │                         │
    │ cancel                  │ publish (L5)
    ▼                         ▼
 archived/cancelled        published ⇄ adjust
```

**主写路径**

| 动作 | 角色 | API | 写 |
|------|------|-----|-----|
| 创建任务 | publisher | `POST /groups/{id}/tasks` | tasks(collecting) |
| 提交空闲 | joiner | `PUT .../responses/me` | task_responses |
| 代填/预置 | publisher | `PUT .../responses/{uid}` 或 preset API | task_responses |
| 取消 | publisher | `POST .../cancel` | tasks archived |

**页面归属**

| 页面 | 唯一核心任务 |
|------|----------------|
| `task` | 浏览并进入要处理的任务 |
| `task-create` | 创建并发布收集任务 |
| `task-detail` | 看进度并决定生成或取消 |
| `publisher-review` | 按人查看填写矩阵 |
| `member-preset` | 为成员预置空闲 |
| `task-mark` / `joiner-fill` | （加入者）提交空闲 — 非发布者规格 |

**发布者 task-detail 焦点**：进度 + 主 CTA「生成排班方案」（详见 example 规格）。

**边界拦截**

| 规则 | 处理 |
|------|------|
| 非 collecting 提交空闲 | 业务失败 |
| 生成时 0 人已填 | 按钮 disabled 或 1306 |
| 标题空/过长 | 前端 blur + 后端校验 |
| 重复创建连点 | in-flight 锁 |

---

### L4 · 方案生成与预览（Scheme）

| 项 | 定义 |
|----|------|
| **唯一核心任务（发布者）** | 基于空闲与规则得到可选排班方案并选定 |
| **边界内** | 创建生成 job、轮询、候选方案列表、预览、手动微调入口 |
| **边界外** | 公示写 assignments、分享 |
| **关键实体** | `schedule_jobs`、`candidate_schedules`、`tasks.generating_job_id` |

**异步协议**

```
POST scheme-jobs → jobId
轮询 GET /jobs/{id}  间隔 1s × 最多 30 次
status: pending|running → success/succeeded | failed
```

**页面归属**

| 页面 | 唯一核心任务 |
|------|----------------|
| `scheme-gen` | 等待生成完成并进入预览 |
| `scheme-preview` | 选择/微调方案并准备公示 |

**边界拦截**

| 规则 | 处理 |
|------|------|
| 超时未完成 | Toast「生成超时，请重试」+ 可再触发 |
| job failed | 展示原因；回 task-detail |
| version 冲突 | Dialog 拉新任务 |
| 无候选 | 禁止点「确认公示」 |

---

### L5 · 公示 · 回执 · 异议（Publish & Objection）

| 项 | 定义 |
|----|------|
| **唯一核心任务（发布者）** | 将选定方案固化为正式班表，并处理异议 |
| **边界内** | publish、final_schedule、user_assignments、share_token、inbox、异议列表处理、adjust、延截止 |
| **边界外** | 收集填报、算法 |
| **关键实体** | `tasks`（published）、`user_assignments`、`notify_inbox`、`task_receipts` |

**主写路径**

| 动作 | API | 写 |
|------|-----|-----|
| 公示 | `POST .../publish` | tasks + assignments + inbox + share_token |
| 调整 | `POST .../adjust` | previous + final |
| 异议（成员） | `POST receipts/me/objection` | task_receipts |
| 处理异议 | 发布者同意/驳回 API | receipts + 可选 adjust |

**页面归属**

| 页面 | 唯一核心任务 |
|------|----------------|
| `public-result` | 展示已公示结果并分享 |
| `objection` | 处理（发布者）或提交（成员，另册） |
| `schedule-receipt` | （成员）查看本人班次 |
| `share` H5 | 只读脱敏预览 |

**边界拦截**

| 规则 | 处理 |
|------|------|
| 非可发布状态点公示 | disabled / 业务码 |
| share_token 过期 | 410 +「链接失效」 |
| 重复 publish | 幂等或明确错误 |

---

### L6 · 通知与个人中心（Notify & Profile）

| 项 | 定义 |
|----|------|
| **唯一核心任务** | 让用户感知待办与身份资料；个人日历辅助填报 |
| **边界内** | inbox 已读、订阅消息开关、资料、calendar-manage、OCR 入口 |
| **边界外** | 分组事务、任务状态机主流程 |

**页面归属**：`profile`、`calendar-manage`；消息可挂 profile 或独立入口。

**与发布者关系**：发布成功写 inbox；订阅消息失败 **不阻断** 发布（logic-data-chain 约定）。

---

## 3. 横切层

### X1 · 请求通道

| 规则 | 落地 |
|------|------|
| 单一 BASE_URL | `utils/config.js` → `/api/v1` |
| 单一 request | `utils/request.js`：鉴权头、401 刷新、错误 Toast |
| Service 解包 | `services/*` 归一 `data`，页面不猜结构 |

### X2 · 权限

| 检查点 | 规则 |
|--------|------|
| 路由进页 | 写页校验 publisher（groupId 维度） |
| 按钮 | 可见性 = 角色 × 任务/成员状态（见 logic-data-chain §6） |
| 服务端 | **最终以服务端 role 为准**，前端仅体验 |

### X3 · 一致性

| 机制 | 用途 |
|------|------|
| 事务 | 建组、publish、踢人多表 |
| version / If-Match | 任务并发 |
| 软删除 | kicked/left/is_active |
| 轮询 | 生成 job、OCR job |

### X4 · 配置

| 源 | 内容 |
|----|------|
| `utils/config.js` | env、BASE_URL、轮询参数 |
| `app.wxss` | 视觉 token |
| 后端 env | WX_APPID/SECRET、DB |

---

## 4. 逻辑层 ↔ 页面矩阵（发布者）

| 页面 | 主责层 | 唯一核心任务（一句话） | 三层规格优先级 |
|------|--------|------------------------|----------------|
| index | L1+L0 | 进入要管理的分组或创建/邀请入口 | P1 |
| style-select | L2 | 选定班表模式 | P1 |
| cal-edit-* | L2 | 保存合法 Duty Grid 模板 | P1 |
| schedule-rules | L2 | 保存生成约束 | P2 |
| share-preview | L1 | 发出邀请码 | P1 |
| group-detail | L1 | 导航到任务或配置 | P1 |
| members | L1 | 踢出/拉黑成员 | P2 |
| task | L3 | 打开目标任务 | P1 |
| task-create | L3 | 创建 collecting 任务 | P0 |
| task-detail | L3→L4 | 审阅进度并决定生成 | P0 |
| publisher-review | L3 | 看清谁填了什么 | P1 |
| member-preset | L3 | 代填空闲 | P2 |
| scheme-gen | L4 | 等到可预览方案 | P0 |
| scheme-preview | L4→L5 | 选定方案并公示 | P0 |
| public-result | L5 | 展示并分享正式表 | P1 |
| objection | L5 | 处理调班异议 | P2 |
| profile | L0+L6 | 登录与资料 | P2 |
| calendar-manage | L6 | 维护个人忙闲 | P3 |
| schedule | L5 读 | 看日历上的班（只读驾驶） | P2 |

**P0 = 最先写完整 publisher-interaction-spec 三层文档的页面。**

---

## 5. 数据流简图（跨层）

```
users ──┬── group_members ── groups ── time_config/rules
        │         │
        │         └── tasks(collecting)
        │                │
        │                ├── task_responses（空闲）
        │                │
        │                ├── schedule_jobs → candidate_schedules
        │                │
        │                └── publish → user_assignments
        │                              notify_inbox
        │                              share_token
        │                              task_receipts（异议）
        └── notify_inbox / calendar
```

---

## 6. 与「页面三层规格」的衔接方式

每个 **P0/P1 页面** 单独文档，强制：

1. **锚定** = 上表「唯一核心任务」  
2. **第一层布局** = 服务该任务的 IA + 数据依赖（本层 API）  
3. **第二层组件** = WeUI/TDesign 参数  
4. **第三层按钮** = 仅本页控件；API/写表必须落在本层或明确调用下层  
5. **TC** = `TC-{page}-{btn}-A|B|C`

模板：`docs/templates/publisher-interaction-page-spec.md`  
已有示范：`docs/templates/example-task-detail-publisher-spec.md`（L3→L4）

---

## 7. 建议落地顺序（设计 → 可测）

| 迭代 | 逻辑层 | 页面三层规格 |
|------|--------|----------------|
| **I1** | L0 + L1 最小 | index 创建/加入入口、share-preview、group-detail |
| **I2** | L2 Duty Grid | style-select、cal-edit-period（先做一种 mode） |
| **I3** | L3 | task-create、task-detail、publisher-review |
| **I4** | L4 + L5 | scheme-gen、scheme-preview、public-result |
| **I5** | L1 members + L5 objection + L6 | members、objection、profile |

---

## 8. 自检

- [x] 七层边界与唯一任务清晰  
- [x] 发布者主路径可串层  
- [x] 每层有实体/API/页面/边界  
- [x] Duty Grid 落在 L2 并贯穿 L3 填报  
- [x] 横切不侵入领域层  
- [x] 可拆页面三层规格与 TC  

---

## 9. 下一步（开任务选项）

按优先级，下一项建议直接开写 **完整三层交互规格**：

1. **P0** `task-create`（L3）  
2. **P0** `task-detail`（补全示例为全文）  
3. **P0** `scheme-preview`（L4→L5）  
4. **P1** `style-select` + `cal-edit-period`（L2 Duty Grid）  

回复编号或页面名即可开始该页的「布局 → 组件 → 逐按钮状态机」全文交付。
