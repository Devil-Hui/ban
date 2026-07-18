# 发布者交互规格 · 新建任务页（全文）

> 角色：**仅发布者**  
> 路由：`pages/task-create/task-create`  
> 设计图：`docs/ui-design-phones.drawio` → **17-新建任务**  
> 代码：`miniprogram/pages/task-create/*` · API：`services/tasks.js` → `POST /groups/{groupId}/tasks`  
> 逻辑层：L3 任务与空闲收集  

---

## 0. 锚定

| 项 | 内容 |
|----|------|
| 角色 | 发布者（publisher）；进页须带合法 `groupId` 且角色为发布者 |
| 页面 | `pages/task-create/task-create` · 新建排班任务 |
| **唯一核心任务** | **配置并发布一轮「收集空闲」任务（status=collecting）** |
| 非目标 | 不在本页填空闲；不在本页生成/公示方案；不管理成员 |
| 入口 | 分组详情「新建任务」/ 任务 Tab 在已选分组上下文创建（代码：`ensureGroupId`，多分组时 Toast「请从分组进入创建」） |
| 成功出口 | `redirectTo` → `task-detail?id={taskId}` |
| 取消出口 | 系统返回 / `navigateBack`（未提交不写库） |

---

## 1. 第一层 · 页面布局全局定义

### 1.1 信息架构（上→下）

| 序号 | 区块 | 职责 | 滚动 |
|------|------|------|------|
| 1 | 导航栏 | 标题「新建排班任务」+ 返回 | 否 |
| 2 | tc-hero | 图标＋说明＋所属分组名 | 随内容 |
| 3 | stepper | 四步指示：基础 / 日期 / 时段 / 约束（展示进度，非强制分页） | 否 |
| 4 | section-card 1 基础信息 | 标题*、描述选填 | 是 |
| 5 | section-card 2 日期范围 | 起止日期*、循环规则、自定义周次 | 是 |
| 6 | section-card 3 时段配置 | 展示方式 mode、基础作息模板、时段预览/微调 | 是 |
| 7 | section-card 4 约束与截止 | 每时段最少人数、每周最大次数、截止时间* | 是 |
| 8 | summary-card | 只读摘要 | 是 |
| 9 | bottom-bar | 次按钮「保存草稿」+ 主按钮「立即发布」 | 否（吸底） |

### 1.2 焦点

**主 CTA「立即发布」**（吸底右侧实心 primary）；整页为表单配置，焦点在完成可发布校验后的主按钮。

### 1.3 栅格与安全区

- 页背景：`#F7F8FA`  
- 内容区：卡片间距按页 wxss（约 16–24rpx）  
- 底栏：`bottom-bar` 预留安全区，防被 Home Indicator 遮挡  
- 顶栏：系统导航栏，避让胶囊  

### 1.4 主 CTA / 次按钮

| 按钮 | 位置 | 样式 |
|------|------|------|
| **立即发布** | 底栏右，主 | `.btn-primary` 实心 `#2B6DE5` 白字；提交中文案「提交中…」+ disabled |
| **保存草稿** | 底栏左，次 | `.btn-outline` 描边 |

### 1.5 数据依赖（首屏）

| 请求/数据 | 用途 | 失败是否阻断 |
|-----------|------|----------------|
| 路由/参数 `groupId` + 分组名 | 所属分组 | **是**（无 groupId 无法发布） |
| `profiles` 列表（基础作息模板） | 时段种子 | 模板空则 periods=[]，发布被拦 |
| 本地 `TIME_MODE_OPTIONS` 等 config | mode 选项 | 否（本地常量） |

无「任务详情」类首屏 GET；失败以 Toast「请从分组进入创建」等形式表现。

### 1.6 空 / 载 / 错 占位

| 态 | 覆盖 | 说明 |
|----|------|------|
| 骨架 | 非必须 | 模板加载中 picker 显示「加载模板…」 |
| 空模板 | section 3 | periods 空 → 发布时 Toast「请选择基础作息模板」 |
| 错误 | Toast / 字段级 | 校验失败不整页错误页 |

### 1.7 页面级边界拦截总表

| 规则 | 条件 | 时机 | UI |
|------|------|------|-----|
| 标题必填 | 空/纯空格 | 点发布 | Toast「请填写任务标题」 |
| 标题长度 | >30 | input maxlength | 计数 `n/30` |
| 描述长度 | >200 | maxlength | `n/200` |
| 日期必填 | 缺 start/end | 点发布 | Toast「请选择日期范围」 |
| 日期顺序 | start > end | 点发布 | Toast「开始日期不能晚于结束」 |
| 时段非空 | periods.length=0 | 点发布 | Toast「请选择基础作息模板」 |
| 分组 | 无 groupId | 点发布 | Toast「请从分组进入创建」 |
| 最少人数 | minPeople 下限 1【代码 counter】 | 点 − | 不可减到 0 |
| 截止 | deadline 解析失败 | 点发布 | 【代码 resolveDeadline；异常时【不确定】】 |
| 重复提交 | submitting=true | 点发布 | 直接 return；按钮「提交中…」 |
| 非发布者 | 无权限建任务 | API 403 | request Toast 服务端 msg |
| 登录 | 无 token | 发布前 ensureLogin | 登录失败则中止 |

---

## 2. 第二层 · 共用组件固定样式参数

| 组件 | 尺寸/色/字号 | 触发 | 关闭 | 遮罩/层级 |
|------|----------------|------|------|-----------|
| **Hero 卡** `.tc-hero` | 页顶；图标区 + 标题 16–18 级；分组名次要色 | 进页 | — | 页面流 |
| **Stepper** | 四步圆点+文案；current/done 态用 primary | 随填写【展示用】 | — | — |
| **Section 卡** | 白底、圆角 md、边框/浅阴影；标题左序号 | — | — | — |
| **Input/Textarea** | 标签上、控件下；hint 右/下 `text-3` | input | — | — |
| **Picker 行** | 整行可点；展示当前值 | tap | 系统 picker 关 | 系统 |
| **Cycle chip** | 小胶囊；active=primary 浅底/描边 | tap | — | — |
| **Counter** | − / 值 / ＋；disabled 灰 | tap | — | — |
| **Dialog 确认发布** | 系统 `wx.showModal`：标题「确认发布」；正文含标题+模式+时段数；确认/取消 | 点立即发布且本地校验过 | 点取消/确认 | 系统模态 |
| **Toast** | 成功 icon success ~1.5–2s；失败 none 2–2.5s | API/校验 | 自动 | 顶层 |
| **底栏按钮** | 主按钮高约 44；primary 实心；outline 描边 | tap | — | 固定底 |
| **骨架** | 本页弱；模板 loading 用文案 | 模板拉取 | 数据到 | — |
| **Empty** | 不适用整页空；用 Toast 引导 | — | — | — |

颜色强制引用：`#2B6DE5` / `#F7F8FA` / `#1F2329` / `#646A73` / `#8F959E` / `#EEF0F3`（`app.wxss`）。

---

## 3. 第三层 · 逐按钮 / 控件数据状态机

---

#### btn_save_draft · 保存草稿

- **控件类型**：button outline  
- **默认样式**：描边、次要  
- **前置不可用条件**  
  1. 无（代码始终可点）  
- **可点时：操作触发动作**  
  - 当前代码：`wx.showToast({ title: '草稿将在后续版本支持', icon: 'none' })`  
  - **无 API、无写库**  
- **分支 A · 成功**  
  - UI：Toast 如上  
  - 刷新：无  
  - 可逆：无  
  - 导航：stay  
  - TC：`TC-task-create-draft-A`（验收「占位提示」）  
- **分支 B · 业务失败**  
  - 不适用（无接口）；未来若实现：磁盘满/配额 → Toast msg，保留表单  
- **分支 C · 网络异常**  
  - 不适用（当前）  
- **备注**：规格保留坑位；实现草稿后补 payload 与三分支  

---

#### btn_publish · 立即发布

- **控件类型**：主 button  
- **默认样式**：`.btn-primary`；文案「立即发布」；`submitting` 时「提交中…」+ `.btn-disabled`  
- **前置不可用条件**  
  1. `submitting === true` → 不可重复点  
  2. （体验建议，代码部分在点击后校验）标题/日期/periods/groupId 非法 → 不发起请求  
- **可点时：操作触发动作**  
  1. 本地校验标题、日期、periods  
  2. `ensureGroupId()`  
  3. `wx.showModal` 确认  
  4. `setData({ submitting: true })`  
  5. `ensureLogin()`  
  6. `tasks.create(groupId, payload)` → **`POST /groups/{groupId}/tasks`**  
  - payload 关键字段：  
    `title, description, dateRangeStart, dateRangeEnd, cycleRule, timeMode, scheduleProfileId, periods[], deadline, constraints: { slotMinPeople, maxShiftsPerWeek }`  
  - 防抖：submitting 锁  

- **分支 A · 后端成功**  
  - UI：Toast「已创建」icon success  
  - 刷新：无本地列表；跳转详情  
  - 可逆：不可撤销创建；只能之后在详情取消任务  
  - 导航：`redirectTo /pages/task-detail/task-detail?id=`；无 id 则 `navigateBack`  
  - TC：`TC-task-create-publish-A`  

- **分支 B · 业务逻辑失败**  
  - UI：`request` 已 Toast 服务端中文 msg（如非发布者 403、校验失败）  
  - 刷新：无；**表单保留**  
  - 可逆：改字段后再次点发布  
  - 导航：stay  
  - TC：`TC-task-create-publish-B-403` / `TC-task-create-publish-B-validate`  

- **分支 C · 网络异常 / 5xx**  
  - UI：request Toast 网络类文案  
  - 刷新：无；`submitting` finally false  
  - 可逆：同一按钮可再点  
  - TC：`TC-task-create-publish-C`  

---

#### ctrl_title · 任务标题输入

- **类型**：input maxlength 30  
- **不可用**：无  
- **触发**：`bindinput` → setData title  
- **A**：字数 hint 更新  
- **B/C**：无网络  
- **边界**：空提交由 btn_publish 拦截  
- TC：`TC-task-create-title-max` / `TC-task-create-title-empty-on-submit`  

---

#### ctrl_desc · 任务描述

- **类型**：textarea maxlength 200  
- **选填**  
- TC：`TC-task-create-desc-max`  

---

#### ctrl_date_start / ctrl_date_end · 开始/结束日期

- **类型**：picker mode=date  
- **触发**：选后 setData  
- **提交拦截**：缺省或 start>end 见上  
- TC：`TC-task-create-date-order`  

---

#### ctrl_cycle_chip · 循环规则芯片

- **类型**：chip 组 weekly / odd_weekly / even_weekly / custom  
- **触发**：`pickCycle`  
- **custom**：展开周次多选 `toggleCustomWeek`  
- **A**：摘要区刷新  
- TC：`TC-task-create-cycle-custom`  

---

#### ctrl_mode_picker · 展示方式

- **类型**：selector picker（timeMode）  
- **触发**：`onModeChange` → 影响 showSectionName/showTimeRange/allowEditRanges  
- TC：`TC-task-create-mode-switch`  

---

#### ctrl_profile_picker · 基础作息模板

- **类型**：selector  
- **触发**：`onProfileChange` → resolvePeriods 写入 periods  
- **不可用观感**：options 空时「加载模板…」  
- TC：`TC-task-create-profile-empty`  

---

#### btn_add_period · ＋ 添加（仅 allowEditRanges）

- **可见**：range 可编辑模式  
- **触发**：`addPeriod`  
- **A**：列表多一行  
- TC：`TC-task-create-period-add`  

---

#### btn_del_period · 删除时段

- **可见**：periods.length > 1 且可编辑  
- **触发**：`delPeriod`  
- **A**：删行；剩 1 条时隐藏删除  
- TC：`TC-task-create-period-del`  

---

#### ctrl_period_start / end · 时段钟点

- **类型**：picker time  
- **触发**：改 start/end；需保证 end>start【代码是否强校验【部分在提交前仅 periods 非空；单段顺序【不确定是否前端强拦】】  
- TC：`TC-task-create-period-time`  

---

#### btn_min_people_dec / inc · 每时段最少人数

- **触发**：dec/incMinPeople  
- **边界**：最小 1  
- TC：`TC-task-create-minpeople-floor`  

---

#### btn_max_week_dec / inc / clear · 每周最大次数

- **触发**：dec/inc/clearMaxWeek；null=不限  
- TC：`TC-task-create-maxweek-null`  

---

#### ctrl_deadline · 截止时间

- **类型**：chip tonight/3days/7days/unlimited/custom + 自定义 date/time picker  
- **提交**：resolveDeadline() 写入 API `deadline`  
- **必填语义**：UI 标 *；unlimited 合法  
- TC：`TC-task-create-deadline-custom`  

---

## 4. 空状态与骨架屏

| 场景 | 触发 | UI | 主操作 |
|------|------|-----|--------|
| 模板加载中 | profileOptions 空 | picker「加载模板…」 | 等待/重进页 |
| 模板列表空 | 接口空数组 | 发布 Toast「请选择基础作息模板」 | 先配分组模板【产品】 |
| 无 groupId | 深链误入 | 发布 Toast「请从分组进入创建」 | 回分组详情 |
| 整页骨架 | 不采用 | — | — |

---

## 5. 极端边界值拦截（汇总）

| 字段/动作 | 边界 | 时机 | UI |
|-----------|------|------|-----|
| title | 空、>30、纯空格 | 发布/输入 | Toast / maxlength |
| description | >200 | 输入 | maxlength |
| date | 缺、start>end | 发布 | Toast |
| periods | [] | 发布 | Toast |
| minPeople | <1 | counter | 不降到 0 |
| 连点发布 | submitting | 点击 | 忽略第二次 |
| 403 非发布者 | API | 响应 | Toast |
| 网络 | 超时 | 响应 | Toast，可重试 |

---

## 6. 测试用例导出表

| TC ID | Given | When | Then |
|-------|-------|------|------|
| TC-task-create-publish-A | 发布者、表单合法 | 确认发布且 201 | Toast 已创建；进 task-detail |
| TC-task-create-publish-B-403 | 非发布者 token | 发布 | Toast 无权限；表单保留 |
| TC-task-create-publish-C | 断网 | 发布 | 网络 Toast；可重试 |
| TC-task-create-title-empty-on-submit | 标题空 | 点发布 | Toast 请填写任务标题；无请求 |
| TC-task-create-date-order | start>end | 点发布 | Toast 开始不能晚于结束 |
| TC-task-create-draft-A | 任意 | 点保存草稿 | Toast 后续版本支持 |
| TC-task-create-period-empty | periods=[] | 点发布 | Toast 请选择基础作息模板 |
| TC-task-create-no-group | 无 groupId | 点发布 | Toast 请从分组进入创建 |

---

## 7. 与设计图 / 代码差异备注

| 项 | 说明 |
|----|------|
| 设计图 17 | 线框步骤 1–3；代码 stepper 为 4 步（基础/日期/时段/约束）→ **以代码为准改设计图或收敛文案** |
| 主按钮文案 | 设计图「发布收集」；代码「立即发布」→ 建议统一为 **立即发布** 或产品二选一 |
| 保存草稿 | 设计有位，代码占位未实现 |

---

**修订**：2026-07-18 · 据 task-create.wxml/js + services/tasks.create 首次全文定稿  
