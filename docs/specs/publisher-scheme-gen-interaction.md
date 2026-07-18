# 发布者交互规格 · 方案生成页 scheme-gen（全文）

> 角色：**仅发布者**  
> 路由：`pages/scheme-gen/scheme-gen`  
> 设计图：`docs/ui-design-phones.drawio` → **21-方案生成中**（设计偏 loading；**代码是完整编辑台**，以代码结构为准扩展设计）  
> 代码：`miniprogram/pages/scheme-gen/*`  
> 逻辑层：L4（编辑/指派）→ L5（发布公示入口）  
> API 真源（目标）：`services/tasks.js` → `generate` / `getJob` / `publish`  
> **重要**：当前 `scheme-gen.js` 大量为**前端模拟数据**（本地格子、自动生成、发布仅 redirect），与 `task-detail` 内真实 `scheme-jobs` 轮询**双轨**。规格同时写清「现状」与「目标态」。

---

## 0. 锚定

| 项 | 内容 |
|----|------|
| 角色 | 发布者 |
| 页面 | 排班方案生成 / 指派台 |
| **唯一核心任务** | **在约束下生成或手填排班表，并发布公示** |
| 非目标 | 不改分组模板定义；不处理异议列表（objection 页） |
| 入口 | 任务详情生成入口 / 导航 `scheme-gen?taskId=`【参数以页面 onLoad 为准】 |
| 成功出口 | 发布后 `redirectTo public-result?mode=published`（现状） |
| 取消出口 | 系统返回（未发布不写 published） |

---

## 1. 第一层 · 页面布局全局定义

### 1.1 信息架构（上→下）

| 序号 | 区块 | 职责 | 滚动 |
|------|------|------|------|
| 1 | 导航栏 | 返回 + 标题 | 否 |
| 2 | steps | 四步：样式✓ 人员✓ 收集✓ **发布(当前)** | 否 |
| 3 | card 生成方式 | manual / random / smart 三选一 | 随页 |
| 4 | card 限制条件 | 条件列表 + 添加 | 随页 |
| 5 | card 排班方案表 | 周切换 + 时段×日格子；点格指派 | 是（横向 scroll） |
| 6 | bottom-bar | 清空/重新生成 + **发布公示** | 否吸底 |
| 7 | 指派 Sheet | 选成员指派到格 | 遮罩层 |
| 8 | 限制条件 Sheet | 添加约束类型与数值 | 遮罩层 |

### 1.2 焦点

**主 CTA「发布公示」**；表内焦点为可点空格「＋」。

### 1.3 栅格与安全区

- 背景 `#F7F8FA`；卡片白底  
- 日历横向 `scroll-view`；底栏预留 safe-area  
- 单元格需 ≥ 可点热区（约 44 逻辑）  

### 1.4 主 CTA / 次按钮

| 按钮 | 位置 | 样式 |
|------|------|------|
| **发布公示** | 底栏右 primary | 实心 `#2B6DE5` |
| **清空 / 重新生成** | 底栏左 outline | manual 显示「清空」，否则「重新生成」 |

### 1.5 数据依赖

| 数据 | 现状代码 | 目标态 |
|------|----------|--------|
| 成员列表 | 本地 mock members | `GET` 任务成员/空闲 |
| 格子 rows | 本地构建 | 候选方案 / 空表 |
| 生成 | `autoGenerate` 本地 | `POST /tasks/{id}/scheme-jobs` + 轮询 job |
| 发布 | 无 API，直接 redirect | `POST /tasks/{id}/publish` body 含 finalSchedule |

首屏：若无 task 上下文，【不确定】是否校验 taskId。

### 1.6 空 / 载 / 错

| 态 | UI |
|----|-----|
| 未指派任何格 | assignedCount=0；点发布 Toast「请先生成方案」 |
| 生成中 | 【目标】全表 skeleton 或遮罩 loading；现状 autoGenerate 瞬时 |
| 生成失败 | Toast「生成失败」；保留旧表 |
| 网络 | Toast；表不清空 |

### 1.7 页面级边界

| 规则 | UI |
|------|-----|
| assignedCount=0 发布 | Toast「请先生成方案」 |
| 锁定格 locked | 不可点改 |
| 约束条数 | 列表展示；删除 × |
| 重复发布 | Modal 确认后跳转；目标应 in-flight 锁 |
| 非发布者 | 禁止进页或 403 |

---

## 2. 第二层 · 共用组件固定样式参数

| 组件 | 参数 | 触发 | 关闭 |
|------|------|------|------|
| **Steps** | 圆点 done=✓ / current 数字；线 done 色 primary | — | — |
| **gm-item 模式卡** | 三列；active 描边/底 primary-light | tap | — |
| **cons-item** | 左文案右 × | 删 | — |
| **add-cons** | 虚线/浅底「＋ 添加限制条件」 | tap | 开 Sheet |
| **周导航** | ‹  周标签  › | tap | — |
| **scell** | 空=＋；已派=名；锁=🔒；assigned/locked class | tap | 开指派 Sheet |
| **Sheet 指派** | 底抽；handle；标题时段+日；成员列表 | 点格 | 遮罩/完成 |
| **Sheet 约束** | 类型选择 + 数字 stepper + 确认 | 添加 | 遮罩/确认 |
| **Dialog 发布** | showModal 标题「确认发布公示」 | 点发布 | 确认/取消 |
| **Toast** | 清空/已添加条件/请先生成 | — | 自动 |
| **底栏** | outline + primary | — | — |

---

## 3. 第三层 · 逐按钮状态机

---

#### ctrl_mode · 生成方式（manual / random / smart）

- **类型**：三选一卡片  
- **不可用**：无  
- **触发**：`pickMode` → setData mode；可能触发本地 autoGenerate【以 js 为准】  
- **A**：UI 高亮对应 mode；random/smart 填格；manual 可空  
- **B/C**：无 API 时不适用；目标态生成失败走 gen 分支  
- TC：`TC-scheme-gen-mode-manual|random|smart`  

---

#### btn_add_constraint · 添加限制条件

- **触发**：`onAddConstraint` → consSheet true  
- **A**：打开约束 Sheet  
- TC：`TC-scheme-gen-cons-open`  

---

#### btn_cons_confirm · 确认添加条件（Sheet 内）

- **触发**：`confirmAddCons` → 本地 push constraints  
- **A**：Toast「已添加条件」；关 Sheet  
- **B/C**：无网络  
- TC：`TC-scheme-gen-cons-add`  

---

#### btn_cons_remove · 删除条件 ×

- **触发**：`removeConstraint` 过滤 id  
- **A**：列表更新  
- TC：`TC-scheme-gen-cons-del`  

---

#### btn_regen · 清空 / 重新生成

- **文案**：manual →「清空」；否则「重新生成」  
- **触发**：  
  - manual：`onReGen` 清空非 lock 格；Toast「已清空」  
  - 其它：`autoGenerate()` 本地重填  
- **目标态（random/smart）**：  
  - `POST scheme-jobs` + 轮询；Loading  
  - **A** 成功：刷新 rows  
  - **B** job failed：Toast 失败；保留旧表  
  - **C** 网络：Toast；可重试  
- **现状**：**无真实 API**  
- TC：`TC-scheme-gen-regen-clear` / `TC-scheme-gen-regen-api-A|B|C`（目标）  

---

#### btn_publish · 发布公示

- **类型**：主 button  
- **前置不可用**  
  1. `assignedCount === 0` → Toast「请先生成方案」（代码点击后拦，非 disabled 样式）  
  2. 建议：publishing 中 disabled【未实现】  
- **触发（2026-07-18 已接真 API）**：  
  - assignedCount=0 → Toast「请先生成方案」  
  - Modal 确认 → `publishing` 锁  
  - 无真实 taskId → 演示 redirect  
  - 否则 `ensureLogin` → `buildFinalScheduleFromRows()` → **`POST /tasks/{id}/publish` `{ finalSchedule }`**  
  - 成功 → Toast + `public-result?taskId=`  
- **分支 A · 成功**  
  - UI：Toast「已发布」/「已发布(演示)」  
  - 刷新：服务端 published（真 taskId 时）  
  - 导航：`redirectTo public-result`  
  - TC：`TC-scheme-gen-publish-A`  
- **分支 B · 业务失败**  
  - request Toast；stay；表保留  
  - TC：`TC-scheme-gen-publish-B`  
- **分支 C · 网络**  
  - request Toast；可重试  
  - TC：`TC-scheme-gen-publish-C`  

---

#### ctrl_cell · 排班空格 / 已指派格

- **触发**：`onCellTap`；locked 忽略  
- **A**：打开指派 Sheet（可选成员列表）  
- **指派确认后**：格显示 memberName；assignedCount++  
- TC：`TC-scheme-gen-cell-assign` / `TC-scheme-gen-cell-locked`  

---

#### ctrl_week_prev / next · 周切换

- **触发**：prevWeek / nextWeek  
- **A**：周标签与列数据切换  
- TC：`TC-scheme-gen-week`  

---

## 4. 空状态与骨架

| 场景 | UI | 操作 |
|------|-----|------|
| 全空表 | 格均为 ＋ | 选 random/smart 或手点 |
| 无约束 | 列表空 + 添加入口 | 添加限制条件 |
| 发布拦截 | Toast 请先生成方案 | 先生成/指派 |

---

## 5. 边界拦截

| 项 | 边界 | UI |
|----|------|-----|
| 发布 | 0 指派 | Toast |
| 锁定格 | locked | 不可改 |
| 约束数值 | 1–20 stepper | inc/dec 夹紧 |
| 双轨生成 | 详情页已 API、本页 mock | **接手必须统一** |

---

## 6. TC 表（核心）

| TC ID | Given | When | Then |
|-------|-------|------|------|
| TC-scheme-gen-publish-A | 有指派 | 确认发布 | 进 public-result（现状）；目标写库 |
| TC-scheme-gen-publish-empty | 0 指派 | 点发布 | Toast 请先生成方案 |
| TC-scheme-gen-regen-clear | manual | 点清空 | 非锁格清空 |
| TC-scheme-gen-cell-assign | 空格 | 选成员保存 | 格显示名 |
| TC-scheme-gen-cons-add | Sheet | 确认条件 | 列表+1 Toast |

---

## 7. 差异与债

| 项 | 说明 |
|----|------|
| 与 task-detail.generate | 详情已打真实 scheme-jobs；本页 UI 更完整但 mock → **合并策略待定** |
| 设计图 21 | 仅 loading；代码为编辑台 → 设计应改为本页结构或拆「生成中」叠加态 |
| 发布未调 API | **P0 工程债** |

---

**修订**：2026-07-18 · 据 scheme-gen.wxml/js 全文  
