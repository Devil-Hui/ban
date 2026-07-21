# 登录入口 + 建组去重 + 五步创建排班任务向导 · 设计规格
> ⚠️ 历史文档：本文件中的 `new/` 等路径已过时，代码已提升到仓库根目录。现行结构见根 README.md。

> 版本: v1.0 | 日期: 2026-07-20  
> 状态: 待用户审阅后进入实现计划  
> 范围: `apps/miniprogram` + `services/api`  
> 参考: 产品设计板 `new/ChatGPT Image 2026年7月18日 20_46_47.png`  
> 校园作息种子源: `apps/miniprogram/constants/schedule-profiles.seed.json`（禁止页面内再写一份分钟表）

---

## 1. 背景与目标

当前新平台小程序存在：

1. 开发登录页展示「小明/小红」等**身份切换**，不符合正式微信登录体验。  
2. 创建任务默认文案/日期为演示值（如「国庆假期值班」、固定 2026-10 日期）。  
3. 「时段与规则」仅有简陋模板列表 + 分钟数展示，未对齐课表式交互。  
4. 详细收集规则（必填信息、预留名单、修改次数、提醒、人数画笔）后端与前端均未建模。

**目标（本轮一次闭环）**

| # | 目标 |
|---|------|
| G1 | 未登录始终进入纯微信登录页，无身份列表 |
| G2 | 建组名称对当前用户可见分组自动后缀去重 |
| G3 | 建任务第 1 步默认：空标题 + 当天日期 + 当天 23:59 截止 |
| G4 | 五步向导：任务信息 → 时段与规则 → 初预览 → 时间选定 → 详细规则 |
| G5 | 课表组件支持预览、点选/拖选、人数画笔 |
| G6 | 前后端扩展任务规则字段并只为选中格生成 `task_slots` |
| G7 | 全局 token（字体/色板/状态码）、domain 与 UI 解耦 |

**非目标**

- 完整 xlsx 二进制解析（本轮文本 + CSV）  
- AI 导入课表、求解器 UI 改造  
- 多租户 SaaS / 支付  
- 替换 TDesign 图标字体 CDN（仅记录 `ERR_CACHE_MISS` 为开发者工具常见告警）

---

## 2. 已确认决策

| 主题 | 决策 |
|------|------|
| 登录 UI | 始终纯微信登录页；开发 mock 不展示身份列表，底层可用默认 mock 用户 |
| 建组重名 | 允许输入同名；对**当前用户可见活跃分组**自动 `名称` / `名称(2)` / `名称(3)`… |
| 任务日期默认 | 开始=今天、结束=今天、截止=今天 23:59；可改多天 |
| 时段预设 | 二级快捷：**08:00·45′** / **08:30·45′** / **手动**；50′ 等放入手动时长。数据为小样本公开表归纳，**非全国统计众数**（见 §5.3.5） |
| 二级微调 | 选快捷后**仍可手动微调**首节开始、时长、节数等，再生成骨架 |
| 实现路径 | 改造现有 `task-create` 为五步状态机 + 可复用课表组件 |
| 交付边界 | **完整五步 + 前后端规则字段一起做** |
| Step4 默认 | 进入「时间选定」时**全不选**，至少选 1 格才能下一步 |
| 人数交互 | **画笔模式**：先设最大 N → 工具条 1..N + 擦除 → 点已选格刷人数并显示数字；未刷默认 1 |
| 其它规则粒度 | 必填/名单/修改次数/提醒/模板 = **任务级**；人数可单格覆盖 |

---

## 3. 登录与入口

### 3.1 页面行为

```
冷启动未登录 → pages/login/login（纯微信登录）
已登录访问 login → reLaunch home
home / groups / me 等业务页 → 依赖 access token；401 走 refresh 单飞；失败 reLaunch login
退出登录 → clearSession + reLaunch login（不再回 home）
```

### 3.2 UI

- 移除「选择开发测试身份」列表与 profile 行。  
- 主按钮文案始终为 **「微信登录」**。  
- `authMode === 'mock'`：点击后调用 `api.login({ interactive: true, mockUserId: 'U03' })`（默认开发账号可配置，**不暴露切换 UI**）。  
- `authMode === 'production'`：`wx.login` → `POST /auth/wechat/login`。  
- 配置错误时按钮 disabled，展示 `configurationError`。

### 3.3 涉及文件

- `pages/login/login.js|wxml|wxss`  
- `pages/me/me.js`（logout 目标）  
- `utils/api.js`（已具备 refresh 单飞与 body `{}` 修复，保持）

---

## 4. 建组名称去重

### 4.1 规则

1. 用户输入 `rawName = trim(input)`，长度 1–120。  
2. 取当前用户可见活跃分组名集合 `S`。  
3. 若 `rawName ∉ S`，最终名 = `rawName`。  
4. 否则找最小整数 `k≥2` 使 `` `${rawName}(${k})` `` ∉ S。  
5. 前端创建前可预览最终名；后端 `GroupService.create` **再次**按该用户活跃分组解析，避免竞态。

### 4.2 API

- 请求仍 `POST /groups { name }`。  
- 响应返回最终 `name`（可能已带后缀）。  
- 前端 toast：「已创建：xxx」以便用户感知自动改名。

---

## 5. 五步创建任务向导

### 5.1 步骤总览

| Step | 名称 | 产出 |
|------|------|------|
| 1 | 任务信息 | `title`, `dateStart`, `dateEnd`, `deadline` |
| 2 | 时段与规则 | `timeMode`, `periods[]`（课表骨架） |
| 3 | 初预览 | 只读确认骨架；可返回 Step2 |
| 4 | 时间选定 | `selectedKeys: Set<"YYYY-MM-DD|periodCode">` |
| 5 | 详细规则 | `rules` + 每格 `maxPeople` 画笔结果 → 提交创建 |

步进条固定展示 1–5；仅允许回到已完成步骤，不允许跳步前进。

### 5.2 Step 1 · 任务信息

| 字段 | 默认 | 校验 |
|------|------|------|
| 任务名称 | 空，placeholder=`请输入任务名称` | 非空，≤160 |
| 开始日期 | 本地今天 `YYYY-MM-DD` | 合法日期 |
| 结束日期 | 本地今天 | ≥ 开始 |
| 收集截止 | 今天 `23:59`（拼本地偏移 ISO） | > 现在 |

交互：原生 `picker mode=date`；下一步按钮在校验通过后启用。

### 5.3 Step 2 · 时段与规则（定义课表骨架）

#### 5.3.1 一级：展示模式（可多选）

| 选项 | `timeMode` | 展示 |
|------|------------|------|
| 时间段 | `range` | 仅钟点 |
| 节次 | `section` | 仅第 N 节 |
| 自定义 | `section_range` | 节次 + 钟点 |

- 勾选「时间段 + 节次」⇒ 强制 `section_range`，**不再出现第三档自定义按钮**，直接进入参数区。  
- 单选一项 ⇒ 出现对应二级快捷。

#### 5.3.2 二级：快捷预设 + 手动微调

**时间段快捷（两大高频首节起点 + 手动）**

1. `08:00 · 45 分钟` → 以既有 `sys_uni_45min_v1` 骨架平移/对齐到 08:00 起  
2. `08:30 · 45 分钟` → 同一 45′ 骨架，首节起点改为 08:30（后续节次按间隔顺延）  
3. `手动` → 首节开始时刻 + 每段时长（默认 45，可选 50 等）+ 段数  

> 不在二级再塞「08:00·50′」独立按钮，避免四个入口过挤；50 分钟在手动时长里一键可选。

**节次快捷**

1. 上午 4 节 / 下午 4 节 等常见组合（参数可配置）  
2. 手动：上午节数、下午节数、晚上节数

**自定义**

- 合并时间段 + 节次参数表单

#### 5.3.3 微调（强制能力）

无论点了哪个快捷：

- 预填参数后，用户**仍可编辑**并实时重算预览条：  
  - 首节开始 `HH:mm`  
  - 单节/单段时长（分钟）  
  - 节间休息、上午大课间（可选高级项，默认跟种子）  
  - 上午/下午/晚上节数  
- 点「生成课表骨架」才写入 `periods[]` 并允许进入 Step3。  
- 返回 Step2 修改后，清空 Step4 选中与 Step5 画笔（防骨架漂移）。

#### 5.3.4 `periods` 形状

与现有后端对齐：

```ts
type Period = {
  code: string;          // p1, p2, ...
  label: string;         // 由 timeMode 决定展示文案
  startMinute: number;   // 0–1439
  endMinute: number;
  endDayOffset?: number;
  minPeople?: number;    // 默认 1，可在 Step5 被画笔覆盖 max
  targetPeople?: number;
  maxPeople?: number;
};
```

纯 domain 函数：`buildPeriodsFromPreset(presetId, tweaks) → Period[]`，禁止页面硬编码分钟表。

#### 5.3.5 首节时间数据依据与表述边界（诚实声明）

**结论：不能宣称「全国高校普遍 8 点第一节」。**

| 事实 | 说明 |
|------|------|
| 无国标 | 中国高校上课时间由各校教务自定，可分校区、夏/冬作息、错峰 |
| 种子样本小 | `schedule-profiles.seed.json` 约 6 所公开表归纳，是**小样本**，不是全国统计众数 |
| 08:00 常见 | 种子记载与多所重点高校公开课表描述多为第 1 节 08:00 起（45′ 或 50′） |
| 08:30 也常见 | 公开检索中多所高校/校区第 1 节为 08:30–09:15 一类；用户最初提到的 8:30 直觉成立 |
| 其它变体 | 08:15、08:20 等少数存在 |

种子自列来源（实现时保留可点击说明或「关于默认模板」文案）：

- [中国药科大学江宁校区上课时间](https://jwc.cpu.edu.cn/868/list.htm) — 种子备注 08:00–08:45  
- [中南大学相关公开信息](https://www.csu.edu.cn/info/1050/1215.htm)  
- [厦门大学相关课表时间](https://spa.xmu.edu.cn/info/1258/3412.htm)  
- [上海交大相关通知](https://sais.sjtu.edu.cn/yjs_tzgg/382.html)  
- [中国矿业大学作息](https://www.cumt.edu.cn/ggfw/zxsj.htm) — 50 分钟代表  
- [北京大学教务相关](https://dean.pku.edu.cn/web/notice_details.php?id=672)  

产品文案禁止写「全国众数」「国家标准」；可写：

> 常见校园起点：08:00 / 08:30（可改）

UI 二级按钮因此定为 **08:00·45′ / 08:30·45′ / 手动**，而不是只推 08:00。

### 5.4 Step 3 · 初预览

- 使用 `schedule-grid` **只读**模式渲染：行 = periods，列 = `[dateStart…dateEnd]`。  
- 顶部摘要：`timeMode` 标签、日期范围、时段数量。  
- 按钮：上一步 / 确认无误，下一步。  
- 不产生选中状态。

### 5.5 Step 4 · 时间选定

- 同一网格，**可交互**。  
- 默认：**全不选**。  
- 交互（对齐设计板 07）：  
  - 单击：切换单格选中  
  - 长按 + 滑动：矩形/连续拖选（实现最低要求：行内连续拖选；矩形拖选作为加分）  
- 选中：绿色填充；未选中：浅灰边框。  
- 至少 1 格选中才可下一步。  
- 产出：`selectedKeys: string[]`，格式 `` `${date}|${periodCode}` ``。

### 5.6 Step 5 · 详细规则

#### 5.6.1 布局

1. **任务级表单**（顶部）  
2. **人数画笔工具条**  
3. **可点课表**（仅已选格可点；未选格禁用且不可刷）  
4. 底部：上一步 / 发布并开始收集

#### 5.6.2 任务级字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `requiredFields` | `Array<'name'\|'studentId'\|'phone'>` | `[]` | 填报时必填 |
| `participantScope` | enum | `all_members` | 见下表 |
| `reservedNames` | `string[]` | `[]` | 仅 scope=reserved_list |
| `deadline` | datetime | Step1 值 | 可覆盖 |
| `allowEditAfterSubmit` | boolean | false | |
| `maxEditCount` | number | 0 | 允许修改时 ≥1 |
| `remindBeforeMinutes` | number \| null | `30` | 截止前提醒；对齐既有订阅模板「未提交/截止提醒」+ deadline-worker |
| `saveAsTemplate` | boolean | false | |
| `templateName` | string | 可选 | saveAsTemplate 时必填 |

#### 5.6.3 填写人身份与预留名单

| `participantScope` | 谁可提交空闲 | 说明 |
|--------------------|--------------|------|
| `all_members` | 仅组内 `active` 成员 | 默认 |
| `share_link` | **组内成员 + 持有效分享链接的访客** | 访客仍须微信登录拿到 `userId`；链接只读不匿名填报 |
| `reserved_list` | 预留名单命中者（及可选：是否仍允许组内成员——**本轮：名单内优先，组内成员仍可提交**，名单用于展示/校验必填姓名等） | 名单非空 |

分享链接：复用平台已有 share token 能力；收集期生成/展示「邀请填报」链接。提交接口校验：

1. 调用方已登录；  
2. 若 scope=`all_members`：必须是组内 active；  
3. 若 scope=`share_link`：组内 active **或** 请求带有效 task share token；  
4. 若 scope=`reserved_list`：组内 active（本轮）或 displayName/名单字段命中 reserved（实现时姓名校验可软提示）。

**预留名单 UI**

- 文本框粘贴：按 `[\s,，、;；\n]+` 分词，去空、去重保序。  
- 解析结果以**表格**展示，可单行编辑/删除/追加。  
- 导入：`wx.chooseMessageFile` 选 `.txt` / `.csv`，读为文本再走同一解析器。  
- **不做** xlsx 解析（二期）。

#### 5.6.3b 截止前提醒（复用已接订阅能力）

订阅模板（新平台 `.env` / deadline-worker；历史对照见 `docs/legacy`）：

| 逻辑键 | 用途 | 模板角色 |
|--------|------|----------|
| `task_published` / `group_joined` | 排班加入/发布通知 | 同一模板 ID 复用 |
| `deadline_remind` | 未提交/截止提醒 | 第二套模板 |

新平台已有 `deadline-worker`：对 `collecting` 且临近截止的任务，给未提交成员写 `notification_outbox`（事件 `schedule.availability.missing`）。**当前实现把窗口写死为 30 分钟**。

本轮约定：

1. Step5 配置 `remindBeforeMinutes`（默认 30，可选 15/30/60/120 或自定义正整数；关闭则 `null`）。  
2. 创建任务时写入 `rules_json.remindBeforeMinutes`（或独立列）。  
3. **改造 deadline-worker**：用任务自己的 `remindBeforeMinutes` 替代硬编码 30；为 `null` 则不发该任务的提前提醒。  
4. 小程序在发布/分享收集链路触发 `wx.requestSubscribeMessage` 时带上 `deadline_remind`（用户点击场景），与旧 `services/notify.js` 双轨思路一致：有微信模板则弹窗，否则站内 outbox 仍达。  
5. 真机微信下发仍依赖 appid/secret 与用户授权次数；本轮验收：**worker 按配置时间入 outbox** + 开发环境可测 outbox 行；真机订阅发送为环境具备时的增强，不挡主链路。

#### 5.6.4 人数画笔

```
用户设置 maxCapacity = N (N≥1)
工具条渲染: [1] [2] … [N] [擦除]
当前工具 tool ∈ {1..N, 'erase', null}

点击已选格:
  if tool === 'erase' → peopleByKey[key] = undefined（提交时按 1）
  if tool ∈ 1..N     → peopleByKey[key] = tool，格内上层显示数字
  if tool === null   → 可打开该格只读摘要（可选），不改人数

未刷过的已选格提交时 maxPeople = 1
```

画笔数字为**更高一层**角标/居中数字，不阻挡格的命中区域（同一 tap 处理）。

#### 5.6.5 提交

调用扩展后的创建任务 API；成功 `redirectTo` 任务详情 `manage=1`。

返回 Step2 改骨架时：清空 `selectedKeys` 与 `peopleByKey`。

---

## 6. 后端与数据模型

### 6.1 创建任务 API

`POST /api/v1/groups/:groupId/tasks`

```ts
{
  title: string;
  dateStart: string;          // YYYY-MM-DD
  dateEnd: string;
  deadline: string;           // ISO
  timeMode: 'range' | 'section' | 'section_range';
  periods: Array<{
    code: string;
    label: string;
    startMinute: number;
    endMinute: number;
    endDayOffset?: number;
    minPeople?: number;
    targetPeople?: number;
    maxPeople?: number;
  }>;
  selectedSlots: Array<{
    date: string;             // YYYY-MM-DD
    periodCode: string;
    maxPeople?: number;       // 画笔结果，默认 1
  }>;
  rules: {
    requiredFields: Array<'name' | 'studentId' | 'phone'>;
    participantScope: 'all_members' | 'share_link' | 'reserved_list';
    reservedNames?: string[];
    allowEditAfterSubmit: boolean;
    maxEditCount: number;
    remindBeforeMinutes: number | null;
    saveAsTemplate?: boolean;
    templateName?: string;
  };
}
```

### 6.2 校验

- 鉴权 + `manageTasks`。  
- `selectedSlots.length ≥ 1`。  
- 每个 `periodCode` ∈ `periods`；每个 `date` ∈ `[dateStart, dateEnd]`。  
- `maxPeople ≥ 1` 且合理上限（如 ≤ 100）。  
- `participantScope === 'reserved_list'` 时 `reservedNames` 至少 1 个非空名。  
- `allowEditAfterSubmit` 时 `maxEditCount ≥ 1`。  
- `deadline` 必须在未来。

### 6.3 持久化

| 存储 | 内容 |
|------|------|
| `shift_templates` + `shift_periods` | 任务内嵌模板（`is_reusable=false`）或可复用模板 |
| `schedule_tasks` | 现有字段 + `time_mode` + `rules_json`（JSON） |
| `task_slots` | **仅** `selectedSlots` 展开；`max_people` 取画笔或 1 |
| `task_reserved_names` | `(task_id, name, sort_order)` 可选独立表；或塞进 `rules_json`（**推荐独立表**便于查询） |
| 可选模板 | `saveAsTemplate` 时再插一条 `is_reusable=true` 的 template |

迁移：新增列/表；兼容旧任务 `rules_json=null` 读默认。

### 6.4 建组去重

`GroupService.create`：在写库前查询该 owner 的活跃分组名，应用 §4.1 算法。

### 6.5 错误码（全局约定）

业务错误统一映射前端可读文案表 `constants/error-codes.js`，示例：

| code | 含义 |
|------|------|
| `INVALID_ARGUMENT` | 参数不合法 |
| `TASK_SLOT_REQUIRED` | 未选定可排班格 |
| `RESERVED_LIST_REQUIRED` | 预留名单为空 |
| `GROUP_NAME_INVALID` | 分组名非法 |

HTTP 层沿用现有 exception filter；前端 `api.errorMessage` 优先 `error.message`。

---

## 7. 前端模块划分（低耦合）

```
utils/
  api.js                 # 请求、登录、refresh 单飞
  auth-session.js        # 可选：token 读写（若拆）
constants/
  time-modes.js          # TIME_MODES / META / 文案
  error-codes.js         # 码 → 文案
  design-tokens.wxss     # 经 app.wxss 引入：字号/色板/圆角
domain/
  period-builder.js      # 快捷+微调 → periods
  slot-selection.js      # key 编解码、拖选、画笔 apply
  name-parser.js         # 名单分词
  group-name.js          # 后缀去重纯函数
  date-defaults.js       # 今天/截止默认
components/
  schedule-grid/         # 只读 | 多选 | 画笔 三种 mode
pages/
  login/
  task-create/           # 仅 step 状态机 + 表单编排
  groups/                # 创建去重
```

**原则**

- 页面不写分钟表、不写分词正则。  
- 组件不调 API。  
- domain 无 `wx` 依赖，便于 `node --test`。  
- 样式 token 全局一份，禁止页面魔法色值复制（允许引用 CSS 变量）。

### 7.1 设计 token（字体存全局）

在 `app.wxss` / `constants/design-tokens.wxss`：

```css
page {
  --font-size-xs: 20rpx;
  --font-size-sm: 24rpx;
  --font-size-md: 28rpx;
  --font-size-lg: 32rpx;
  --font-size-xl: 40rpx;
  --color-brand: #1e9e5a;
  --color-brand-soft: #e8f7ef;
  --color-danger: #df5c4c;
  --color-text: #1f2a24;
  --color-text-secondary: #7b8780;
  --radius-md: 16rpx;
}
```

对齐设计板绿色主色与字号阶梯。

---

## 8. 课表组件 `schedule-grid`

### Props

| prop | 说明 |
|------|------|
| `periods` | 行定义 |
| `dates` | 列日期数组 |
| `timeMode` | 单元格文案策略 |
| `mode` | `readonly` \| `select` \| `paint` |
| `selectedKeys` | 选中 key 列表 |
| `peopleByKey` | key → number |
| `maxCapacity` | 画笔上限（paint） |
| `activeTool` | 当前画笔 |

### Events

- `toggle` / `range-select`（select 模式）  
- `paint`（paint 模式，带 key + people）  

单元格展示：

- `range`：`HH:mm–HH:mm`  
- `section`：`第N节`  
- `section_range`：两行或「第N节 HH:mm–HH:mm」

---

## 9. 测试计划

### 9.1 Domain 单测（node:test）

- `group-name` 后缀序列  
- `date-defaults` 当天边界  
- `period-builder` 45/50 分钟与微调覆盖  
- `name-parser` 空格/逗号/顿号/换行  
- `slot-selection` key、拖选、画笔默认 1  

### 9.2 API 集成测

- 创建任务仅生成 selectedSlots 对应 slots  
- reserved_list 无名单 → 400  
- saveAsTemplate 产生可复用模板  
- 建组重名后缀  

### 9.3 小程序手测清单

1. 冷启动见纯微信登录，无身份列表  
2. 建两个同名分组 → 第二个自动 `(2)`  
3. 建任务 Step1 默认当天、空标题 placeholder  
4. Step2 快捷后可改首节时间再生成  
5. Step3 只读课表  
6. Step4 默认不选；拖选后进 Step5  
7. Step5 画笔 2 人次刷格显示「2」；发布成功进详情  

---

## 10. 实施顺序（供 writing-plans 展开）

1. Domain 纯函数 + 单测  
2. 登录页去身份 UI + logout 目标  
3. 建组后缀（前端 + 后端）  
4. `schedule-grid` 组件  
5. `task-create` 五步状态机（先串 UI，mock 提交）  
6. API 迁移 + createTask 扩展 + 集成测  
7. 前后端联调 + 手测清单  
8. 设计 token 收口  

---

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 多日 × 多节网格过大 | 单日默认；日期跨度 >7 天时提示性能并建议缩小 |
| 拖选手势与页面滚动冲突 | 网格区 `catchtouch*`；提示用户横滑列 |
| rules 字段膨胀 | 任务级 JSON + 名单独立表；单格只存 maxPeople |
| mock 登录被误当正式能力 | UI 永不展示身份切换；仅服务端 accept mock code |

---

## 12. 成功标准

- [ ] 任意环境登录页无身份切换 UI  
- [ ] 同用户连续创建同名分组得到唯一展示名  
- [ ] 新建任务默认日期为「今天」，标题 placeholder 正确  
- [ ] 五步可完整走通并创建任务  
- [ ] 任务 slots 数量 = 选中格数量  
- [ ] 画笔人数写入对应 slot.maxPeople  
- [ ] reserved_list + 名单在库中可查  
- [ ] domain 单测与关键 API 集成测通过  

---

## 修订记录

| 日期 | 变更 |
|------|------|
| 2026-07-20 | 初稿：汇总登录、建组、五步向导、画笔人数、API 扩展 |
| 2026-07-20 | 修正时段预设：二级改为 08:00·45′ / 08:30·45′ / 手动；增加 §5.3.5 数据依据与「非全国众数」边界 |
| 2026-07-20 | 提醒：复用已接两套订阅模板 + 改造 deadline-worker 读取 `remindBeforeMinutes`（替代写死 30 分钟） |
| 2026-07-20 | `share_link` = 组内成员 + 持有效分享链接的已登录访客可填 |
