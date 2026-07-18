# 发布者交互规格 · 任务详情页（全文）

> 角色：**仅发布者**（加入者按钮另册，文末附录索引）  
> 路由：`pages/task-detail/task-detail`  
> 设计图：`docs/ui-design-phones.drawio` → **18-任务详情-收集中** / **19-任务详情-已公示**  
> 代码：`miniprogram/pages/task-detail/*` · `services/tasks.js`  
> 逻辑层：L3 → L4（生成）→ L5（发布相关入口）  
> 取代：`docs/templates/example-task-detail-publisher-spec.md` 的节选地位（示例可保留作入门）

---

## 0. 锚定

| 项 | 内容 |
|----|------|
| 角色 | 发布者 `task.role === 'publisher'`（由详情 myRole/上下文注入） |
| 页面 | 任务详情 |
| **唯一核心任务** | **在当前任务状态下推进收集/生成/发布相关操作（以状态机分支主 CTA 为准）** |
| 非目标 | 不在本页编辑 Duty Grid 模板定义；不做成员踢除（members 页） |
| 入口 | 任务列表 / 创建成功 redirect / 分组任务入口，`?id={taskId}` |
| 成功出口 | 生成中可留页轮询；取消成功 `navigateBack`；分享/异议/填报等 `navigateTo` 子页 |
| 取消出口 | 系统返回 |

**状态与底栏主 CTA（发布者）**（代码 `bottom-bar`）：

| stateClass | 主 CTA | 次按钮 |
|------------|--------|--------|
| collecting | **手动生成方案** `goGenerate` | 延长截止、取消任务 |
| reviewing | **生成排班方案** `goGenerate` | 重新收集 |
| published | **调整方案** `goAdjust` → scheme-preview | 查看公示、分享预览 |
| adjusting | **继续调整** `goAdjust` → scheme-preview | 查看公示 |

---

## 1. 第一层 · 页面布局全局定义

### 1.1 信息架构（上→下）

| 序号 | 区块 | 职责 | 滚动 |
|------|------|------|------|
| 1 | 导航栏 | 返回 + 标题 | 否 |
| 2 | td-hero | 状态标签、角色、标题、分组·日期 | 随页 |
| 3 | timeline-card | 任务进度节点（收集/生成/公示等） | 随页 |
| 4 | info-card | 日期范围、时段配置、约束、截止 | 随页 |
| 5 | 时段详情列表 | periods 列表与人数/头像 | 是 |
| 6 | 提交进度（条件） | collecting 时成员提交列表 + 重开 | 是 |
| 7 | 提交热力日历（条件） | 按周热力 + 日详情 | 是 |
| 8 | 异议列表（条件） | objections.length>0 | 是 |
| 9 | bottom-bar | 状态相关操作按钮 | 否吸底 |

### 1.2 焦点

- **collecting / reviewing**：主按钮「手动生成方案 / 生成排班方案」  
- **published / adjusting**：主按钮「调整方案 / 继续调整」→ `scheme-preview`  
- 视觉焦点：Hero 状态色 + 进度 

### 1.3 栅格与安全区

- 背景 `#F7F8FA`；卡片白底  
- 底栏安全区；内容底部 padding 防遮挡  

### 1.4 主 CTA 位置

- 吸底 `bottom-bar` 右侧/通栏 primary  

### 1.5 数据依赖（首屏）

| 请求 | 用途 | 阻断 |
|------|------|------|
| `GET /tasks/{id}`（tasks.getOne） | 任务主数据、role、state | **是** → 错误/空 |
| 提交进度/热力/异议 | 发布者附加块 | 否（块级失败可降级）【实现细节以 loadTask 为准】 |

阻塞字段：`taskId`、任务主体、`task.role`、`task.stateClass`。

### 1.6 空 / 载 / 错

| 态 | UI |
|----|-----|
| 骨架 | 建议 Hero+信息卡骨架（【代码是否有独立 skeleton 组件【不确定】】）；至少 loading |
| 加载失败 | Toast + 可返回 |
| 时段空 | 列表 0 个；仍可按状态操作（生成可能业务失败） |
| 异议空 | 整块不渲染 |

### 1.7 页面级边界

| 规则 | UI |
|------|-----|
| 无 taskId | 不加载 / 返回 |
| 非发布者 | 底栏走加入者分支（本规格不展开业务按钮细节，见附录） |
| canGenerate=false | 生成按钮逻辑 return（人数/状态） |
| in-flight 生成 | showLoading；避免双 job【代码 while 轮询中再次点击风险：应禁用【改进点】】 |
| version 冲突 | API Toast；loadTask 刷新 |
| 开发中能力 | reopenSubmit / rollbackScheme → Toast「开发中」；**goAdjust 已接 scheme-preview** |

---

## 2. 第二层 · 共用组件固定样式参数

| 组件 | 参数 | 触发 | 关闭 |
|------|------|------|------|
| **Hero** `.td-hero-*` | 随 stateClass 变背景/标签色；标题 16–18 粗；meta text-2 | 数据到 | — |
| **状态标签** `.tag-*` | 小胶囊；collecting/reviewing/published 色不同 | — | — |
| **时间线** | 圆点 done=✓ / current 高亮 / 未到灰 | — | — |
| **Info 行** | 左 label text-3，右 value；截止紧急 text-warning | — | — |
| **时段行** | 左序号、中时间、右头像；不足标红 | — | — |
| **进度条** | track 浅底 + fill primary 宽度 % | — | — |
| **热力格** | heatLevel 0–3 色阶；今日描边 | tap 日 | 关详情 × |
| **异议卡** | 头像+名+时间+tag 待处理+原因摘要 | tap | 进 objection |
| **Dialog** | 系统 showModal（取消任务/延长截止/生成后是否发布） | 按钮 | 确认/取消 |
| **Loading** | showLoading「提交生成…」 | 生成 | hideLoading |
| **Toast** | success / none | API | 自动 |
| **底栏按钮** | primary / outline / ghost；高约 44；多按钮横排 | tap | — |

Token：`#2B6DE5`、`#F7F8FA`、`#E88B8B`（取消 confirmColor 代码已用）、警告用 app.wxss warning。

---

## 3. 第三层 · 逐按钮数据状态机（发布者）

---

#### btn_generate · 手动生成方案 / 生成排班方案

- **控件类型**：主 button（collecting 文案「手动生成方案」；reviewing「生成排班方案」）  
- **默认样式**：primary 通栏  
- **前置不可用条件**  
  1. `!canGenerate`（代码守卫；含状态/人数等前端计算）→ 点击无效  
  2. 非 publisher 不显示该主按钮  
  3. 生成轮询进行中 → `_generating` 锁，忽略连点（2026-07-18 已加）  
- **可点时：触发**  
  - `ensureLogin`  
  - `showLoading`  
  - `POST /tasks/{id}/scheme-jobs`（tasks.generate）  
  - 取 jobId，轮询 `GET /jobs/{jobId}` 最多 25 次、间隔 800ms  
  - status 兼容 success→succeeded  
- **分支 A · 成功（job succeeded）**（2026-07-18 收敛）  
  - UI：Toast「方案已生成」  
  - 导航：`navigateTo scheme-preview?taskId=&mode=generate`（**统一在预览页发布**，详情不再 Modal 直发）  
  - 若仅创建 job：Toast「已开始生成」后轮询；同步无 jobId 也进 preview  
  - 刷新：可选 loadTask  
  - 可逆：未发布前可再生成  
  - TC：`TC-task-detail-gen-A`  
- **分支 B · 业务失败**  
  - job status failed → Toast「生成失败」  
  - API 业务码（如人数不足 1306）→ request Toast msg  
  - 刷新：可选 loadTask  
  - 可逆：改收集条件后重试  
  - TC：`TC-task-detail-gen-B-failed` / `TC-task-detail-gen-B-api`  
- **分支 C · 网络异常**  
  - hideLoading；request Toast；stay  
  - 可逆：再点生成  
  - TC：`TC-task-detail-gen-C`  

**publish 归属**：正式发布在 **scheme-preview.confirmScheme** / **scheme-gen.onPublish**（`tasks.publish`）。详情页仍保留 `publishScheme()` 方法可作兜底，但主路径不再弹「是否立即发布」。  

---

#### btn_extend_deadline · 延长截止

- **可见**：publisher ∧ collecting  
- **样式**：outline  
- **前置**：无额外 disabled  
- **触发**：Modal「将截止时间延长 2 天，并保持收集状态」→ 确认 → ensureLogin → `POST /tasks/{id}/deadline/extend` `{ deadline: +2天 23:59 }`  
- **A**：Toast「已延长」；loadTask  
- **B**：业务 Toast；表单无  
- **C**：网络 Toast；可重试  
- **可逆**：无自动撤销；可再延  
- TC：`TC-task-detail-extend-A|B|C`  

---

#### btn_cancel_task · 取消任务

- **可见**：publisher ∧ collecting（归档复用见 archive）  
- **样式**：ghost；危险确认色 `#E88B8B`  
- **触发**：Modal「取消后任务将归档」确认 → `POST /tasks/{id}/cancel`  
- **A**：Toast「任务已取消」；600ms 后 navigateBack  
- **B**：业务 Toast；stay  
- **C**：网络 Toast；stay  
- **可逆**：无（归档后恢复【不确定是否支持】）  
- TC：`TC-task-detail-cancel-A|B|C`  

---

#### btn_reopen_collect · 重新收集

- **可见**：reviewing  
- **样式**：outline  
- **触发**：代码 **直接调用 extendDeadline()**（延长 2 天语义，非独立 API 名）  
- **A/B/C**：同延长截止  
- **备注**：文案「重新收集」与实现「延长截止」不一致 → 产品/文案债  
- TC：`TC-task-detail-reopen-A`  

---

#### btn_archive · 归档任务

- **可见**：published  
- **触发**：**等同 cancelTask**  
- **A/B/C**：同取消  
- TC：`TC-task-detail-archive-A`  

---

#### btn_share · 分享预览

- **可见**：published（发布者底栏）  
- **触发**：`navigateTo share-preview?taskId=`  
- **A**：进入分享页  
- **B/C**：无请求则仅导航失败系统处理  
- TC：`TC-task-detail-share-A`  

---

#### btn_adjust · 调整方案 / 继续调整

- **可见**：published / adjusting  
- **触发**：`goAdjust` → `navigateTo scheme-preview?taskId=&mode=adjust`  
- **A**：进入方案预览（可改格后 publish / 已发布任务再调整）  
- **B/C**：导航失败系统处理；页内 API 见 scheme-preview 规格  
- TC：`TC-task-detail-adjust-A`  

---

#### btn_public_result · 查看公示

- **可见**：published / adjusting  
- **触发**：`goPublicResult` → `public-result?taskId=&mode=view`  
- **A**：进入公示结果真数据页  
- TC：`TC-task-detail-public-result-A`  

---

#### btn_rollback · 回滚上版

- **可见**：代码曾提供，**底栏已收敛去掉**；若其它入口调用仍 Toast「回滚开发中」  
- TC：`TC-task-detail-rollback-stub`  

---

#### btn_reopen_submit · 重开 / 重开提交

- **可见**：提交进度列表行（pending/submitted）  
- **触发**：Toast「重开提交开发中」  
- TC：`TC-task-detail-reopen-submit-stub`  

---

#### btn_objection_card · 异议卡片

- **可见**：objections.length > 0  
- **触发**：`navigateTo objection?taskId=`（带 id）  
- **A**：进入异议页  
- TC：`TC-task-detail-objection-nav-A`  

---

#### ctrl_heat_cell · 热力日期格

- **触发**：`onCellTap` → 展开 selectedDate 详情  
- **A**：显示当日各时段提交者  
- **关闭**：`closeDetail`  
- TC：`TC-task-detail-heat-open-close`  

---

#### ctrl_heat_prev / next · 上周/下周

- **触发**：prevWeek / nextWeek 改 calWeekLabel 与 cells  
- TC：`TC-task-detail-heat-week`  

---

## 4. 空状态与骨架屏

| 场景 | 触发 | UI | 主操作 |
|------|------|-----|--------|
| 首屏加载 | getOne 未返回 | Loading/骨架 | 等待 |
| 加载失败 | 网络/404 | Toast；可返回 | 返回列表 |
| 提交进度全 pending | collecting | 列表全未提交样式 | 提醒成员【无按钮则分享外链】 |
| 热力无数据 | 全 0 | 色阶最浅 | — |
| 异议空 | length 0 | 不展示区块 | — |

---

## 5. 极端边界值拦截

| 项 | 边界 | 时机 | UI |
|----|------|------|-----|
| 生成 | canGenerate false | 点击 | 无请求 |
| 生成 | 连点 | 轮询中 | 【缺口】可能双 job |
| 取消 | 非 collecting | 不显示按钮 | — |
| 标题展示 | 超长 | 渲染 | 单行省略【wxss】 |
| 截止紧急 | deadlineUrgent | 渲染 | text-warning |
| 权限 | 非发布者 | 底栏 | 加入者按钮集 |

---

## 6. 测试用例导出表（发布者核心）

| TC ID | Given | When | Then |
|-------|-------|------|------|
| TC-task-detail-gen-A | collecting 且 canGenerate | 生成成功 | Toast 方案已生成；进入 scheme-preview |
| TC-task-detail-gen-A-publish | 上一步后确认发布 | publish 成功 | Toast 已发布；状态 published |
| TC-task-detail-gen-B-failed | job failed | 轮询到 failed | Toast 生成失败 |
| TC-task-detail-gen-C | 断网 | 点生成 | 网络错误；可重试 |
| TC-task-detail-extend-A | collecting | 确认延长 | Toast 已延长；截止更新 |
| TC-task-detail-cancel-A | collecting | 确认取消 | Toast 已取消；返回 |
| TC-task-detail-share-A | published | 点分享预览 | 进入 share-preview |
| TC-task-detail-adjust-A | published | 点调整方案 | 进入 scheme-preview mode=adjust |
| TC-task-detail-public-result-A | published | 点查看公示 | 进入 public-result |
| TC-task-detail-heat-open-close | 有热力数据 | 点日再关 | 详情显隐正确 |
| TC-task-detail-non-publisher | role 成员 | 进页 | 底栏为去填写/查收等 |

---

## 7. 设计图 / 代码 / 文档差异

| 项 | 设计图 | 代码现状 | 接手建议 |
|----|--------|----------|----------|
| 生成中页 | 21 loading / 22 预览 | 详情轮询后进 scheme-preview | 已统一到 preview 发布 |
| 主 CTA 文案 collecting | 生成排班方案 | 「手动生成方案」 | 统一文案 |
| 发布 | 预览页确认公示 | 生成成功后 Modal 发布 | 可双轨保留 |
| 查看成员填写 | 有 | 【wxml 发布者进度内联；独立 publisher-review 导航【部分入口【不确定】】】 | 对齐路由 |
| 调整方案 | 有 | 进 scheme-preview | 已接 |
| 查看公示 | 有 | 进 public-result | 已接 |
| 回滚/重开提交 | 有位 | Toast 开发中 / 底栏已收敛 | 排期实现 |

---

## 附录 · 加入者底栏（本规格不展开状态机）

| 状态 | 按钮 |
|------|------|
| collecting | 去填写空闲 → task-mark |
| published | 分享预览、查看并查收 → receipt |
| adjusting | 等待重新发布（无请求） |

加入者完整三层规格：另文 `publisher` 不对齐角色，应建 `joiner-*-interaction.md`。

---

**修订**：2026-07-18 · 据 task-detail.wxml/js + services/tasks 全文定稿  
