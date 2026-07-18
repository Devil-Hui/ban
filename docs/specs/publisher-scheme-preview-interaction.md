# 发布者交互规格 · 方案预览页 scheme-preview（全文）

> 角色：**仅发布者**  
> 路由：`pages/scheme-preview/scheme-preview`  
> 设计图：`docs/ui-design-phones.drawio` → **22-方案预览**  
> 代码：`miniprogram/pages/scheme-preview/*`  
> 逻辑层：L4 选定方案 → L5 确认发布  
> API 目标：`tasks.generate` / `getJob` / `publish` / `adjust`  
> **现状（2026-07-18）**：真 `taskId` 拉 `candidateSchedules` 渲染；`regenerate` 走 scheme-jobs；发布 `publish({ finalSchedule })`；演示 id 仍 mock

---

## 0. 锚定

| 项 | 内容 |
|----|------|
| 角色 | 发布者 |
| 页面 | 方案预览 / 多方案对比与微调 |
| **唯一核心任务** | **在多套候选方案中选定一套，确认后发布** |
| 非目标 | 不创建任务；不收集空闲；不配置分组模板 |
| 入口 | 生成完成后进入 / `scheme-preview?taskId=` |
| 成功出口 | 发布成功 → public-result 或 task-detail published |
| 取消出口 | 「返回修改」`goBack` |

---

## 1. 第一层 · 页面布局全局定义

### 1.1 信息架构（上→下）

| 序号 | 区块 | 职责 | 滚动 |
|------|------|------|------|
| 1 | 导航栏 | 返回 + 标题 | 否 |
| 2 | sp-hero | 任务标题、分组、方案套数、模式标签 | 随页 |
| 3 | scheme-switcher | 多方案卡片切换（人次/最多/均衡分） | 横滑/竖排 |
| 4 | current-scheme-card | 当前方案指标 + 重新生成 + warnings | 随页 |
| 5 | 人员负荷 | 人均次数条 | 是 |
| 6 | 排班详情（按周） | 周切换 + 表头 + 格子；点格调整 | 是 |
| 7 | bottom-bar | **返回修改** + **确认此方案并发布** | 否吸底 |
| 8 | adjust Sheet | 候选人多选/切换 + 保存 | 遮罩 |

### 1.2 焦点

**主 CTA「确认此方案并发布」**；次焦点为当前选中方案卡。

### 1.3 栅格与安全区

- 同全局 v4；表横向 scroll；底栏 safe-area  
- 方案卡 active 态需清晰描边/勾选 ✓  

### 1.4 主 CTA / 次按钮

| 按钮 | 样式 |
|------|------|
| 确认此方案并发布 | primary 通栏/主 |
| 返回修改 | outline |
| 重新生成 | 文本/轻按钮在卡片头 |

### 1.5 数据依赖

| 数据 | 现状（2026-07-18） | 说明 |
|------|-------------------|------|
| schemes[] | **真 taskId：`GET /tasks/{id}` → candidateSchedules**；演示 id 仍 mock | applySchemesFromRaw |
| rows | **由当前方案 assignments 填格**；无候选则空表+警告 | buildScheduleRows |
| loadData | 由 assignments 按人聚合 | buildLoadData |
| 重新生成 | 真 id：`scheme-jobs` 轮询后重拉任务候选 | regenerate |
| 发布 | `publish({ finalSchedule })` | 已接 |
| 微调保存 | 写回 rows，标记 _rowsDirty，发布时用表格组装 | saveAdjust |

### 1.6 空 / 载 / 错

| 态 | UI |
|----|-----|
| 无方案 schemes=[] | 【应】Empty「暂无方案」+ 去生成；【现状】【不确定是否守卫】 |
| 重新生成中 | showLoading「重新生成中」 |
| warnings>0 | 黄/警告行，不拦截发布（除非产品要求） |
| 发布失败 | Toast；stay |

### 1.7 页面级边界

| 规则 | UI |
|------|-----|
| 未选方案 | 默认 index=0 |
| 覆盖率/紧急格 urgent | 样式 sp-cell-urgent；可仍发布 |
| 发布中 | 按钮 loading【建议】 |
| 非发布者 | 禁入 |

---

## 2. 第二层 · 共用组件固定样式参数

| 组件 | 参数 | 触发 | 关闭 |
|------|------|------|------|
| **Hero** | 白/浅底；标题粗；meta text-2；右侧模式胶囊 | — | — |
| **ss-card** | 方案卡；active 边 primary + ✓ | tap 切换 | — |
| **指标行** | 四等分总人次/人数/人均/覆盖率 | — | — |
| **warn-row** | 左 ! 中文案 右 action 文案 | — | — |
| **load-row** | 头像+名+次数+progress bar | — | — |
| **sp-cell** | 空/已填/urgent；点按 | tap | 开 Sheet |
| **week-nav** | ‹  label  › | tap | — |
| **adjust Sheet** | 底栏双按钮取消/保存；候选人列表 toggle | 点格 | 遮罩/取消/保存 |
| **Toast / Loading** | 系统 | 再生/保存 | 自动 |
| **底栏** | outline + primary | — | — |

色：primary `#2B6DE5`；警告条用 warning token；危险格 urgent 用 danger 浅底。

---

## 3. 第三层 · 逐按钮状态机

---

#### ctrl_scheme_card · 方案切换卡

- **触发**：`switchScheme` data-index  
- **A**：currentScheme 更新；重建 rows/负荷  
- **B/C**：无网络  
- TC：`TC-scheme-preview-switch`  

---

#### btn_regenerate · 重新生成

- **位置**：当前方案卡头  
- **触发（现状）**：showLoading 1.2s → Toast「已生成新方案」→ rebuild 本地  
- **目标**：`POST /tasks/{id}/scheme-jobs` + 轮询；成功替换 schemes  
- **A 现状**：Toast 成功；表格刷新（mock）  
- **A 目标**：新候选列表；默认选中最新  
- **B**：job failed Toast；保留旧方案  
- **C**：网络 Toast；可重试  
- **可逆**：无自动回滚；可再切换旧卡若仍保留  
- TC：`TC-scheme-preview-regen-A|B|C`  

---

#### btn_confirm_publish · 确认此方案并发布

- **类型**：主 button  
- **前置不可用**  
  1. schemes 空 → 应 disabled 或 Toast  
  2. publishing 中 → disabled【建议】  
  3. 【可选】warnings 强制处理【产品未强制】  
- **触发（2026-07-18 已接真 API）**：  
  1. `publishing` 锁  
  2. Modal「确认发布」  
  3. 无真实 taskId（空或 `T00*`）→ 演示 redirect public-result  
  4. 否则 `ensureLogin` → `buildFinalScheduleFromRows()` → **`POST /tasks/{id}/publish` `{ finalSchedule }`**  
  5. 成功 Toast「已发布」→ `redirectTo public-result?taskId=`  
- **分支 A · 成功**  
  - UI：Toast「已发布」；按钮「发布中…」  
  - 刷新：服务端 published + assignments + inbox  
  - 可逆：无  
  - 导航：`public-result`  
  - TC：`TC-scheme-preview-publish-A`  
- **分支 B · 业务失败**  
  - request Toast msg；`publishing=false`；stay  
  - TC：`TC-scheme-preview-publish-B`  
- **分支 C · 网络**  
  - request Toast；可重试  
  - TC：`TC-scheme-preview-publish-C`  

---

#### btn_go_back · 返回修改

- **触发**：`goBack` → navigateBack 或回 scheme-gen/task-detail  
- **A**：离开页；未发布变更【是否提示未保存【建议 Modal 若有本地 adjust】】  
- TC：`TC-scheme-preview-back`  

---

#### ctrl_cell · 排班格 adjustCell

- **触发**：打开 adjustSheet；带入 date/period/候选人  
- **A**：Sheet 展示  
- TC：`TC-scheme-preview-cell-open`  

---

#### ctrl_candidate_toggle · 候选人点选

- **触发**：`toggleCandidate` 切换 selected  
- TC：`TC-scheme-preview-candidate-toggle`  

---

#### btn_save_adjust · Sheet 保存

- **触发**：`saveAdjust` 写回 rows 本地  
- **A**：关 Sheet；格更新；Toast 可选  
- **目标**：`POST adjust` 或仅本地至发布一次性提交  
- **B/C**：目标 API 失败 Toast；Sheet 可保持  
- TC：`TC-scheme-preview-adjust-save-A`  

---

#### btn_close_adjust · 取消

- **触发**：`closeAdjust`；不保存  
- TC：`TC-scheme-preview-adjust-cancel`  

---

#### ctrl_week_prev / next

- **触发**：改周；rebuild 列  
- TC：`TC-scheme-preview-week`  

---

## 4. 空状态与骨架

| 场景 | UI | 操作 |
|------|-----|------|
| 无方案 | Empty +「去生成」 | 回 gen/detail |
| 再生 loading | 遮罩/Loading | 等待 |
| 负荷空 | 空列表 | — |
| 警告条 | warnings 列表 | 可点 action【若仅展示则无跳转】 |

---

## 5. 边界拦截

| 项 | 边界 | UI |
|----|------|-----|
| 发布 | 无选中方案 | 拦截 |
| 覆盖率 0 | 仍可发【或拦】 | 产品定 |
| urgent 空格 | 高亮；不自动拦发布 | 警告 |
| 连点发布 | 二次确认 + 锁 | 防双发 |
| mock→真 | 切换 API 后 TC 全回归 | 必须 |

---

## 6. TC 表（核心）

| TC ID | Given | When | Then |
|-------|-------|------|------|
| TC-scheme-preview-switch | ≥2 方案 | 点方案 B | 详情与表切换 |
| TC-scheme-preview-regen-A | 任意 | 重新生成成功 | Toast+表更新 |
| TC-scheme-preview-publish-A | 已选方案 | 确认发布成功 | 已发布并跳转 |
| TC-scheme-preview-publish-B | 非法状态 | 发布 | Toast；留页 |
| TC-scheme-preview-publish-C | 断网 | 发布 | 网络 Toast |
| TC-scheme-preview-adjust-save-A | 打开 Sheet | 改人选保存 | 格更新 |
| TC-scheme-preview-back | 任意 | 返回修改 | 回上页 |

---

## 7. 设计图 / 代码差异

| 项 | 设计图 22 | 代码 | 建议 |
|----|-----------|------|------|
| 多方案卡 | 有 A/B | 有 schemes 切换 | 对齐字段名 |
| 重新生成 | 弱 | 有 regenerate | 保留 |
| 确认发布 | 有 | confirmScheme | 必须接 publish API |
| 数据 | 静态 | 大量 seed/mock | P0 接真数据 |

---

## 8. 与 scheme-gen、task-detail 的职责切分（强制）

| 能力 | 建议归属 |
|------|----------|
| 发起 scheme-jobs | task-detail 或 scheme-gen **二选一主入口**，另一处只跳转 |
| 多方案对比+发布 | **scheme-preview** |
| 纯手动铺表 | scheme-gen manual |
| 发布 API | preview 确认 or gen 发布 **最终只调用一次 publish** |

接手时先开短会定主入口，避免双页都 mock、详情又真调用的三轨。

---

**修订**：2026-07-18 · 据 scheme-preview.wxml/js 全文；标明 mock 债  
