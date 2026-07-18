# 示例：任务详情页（发布者）交互规格（节选示范）

> 示范如何填三层模板。完整页请复制 `publisher-interaction-page-spec.md` 全量填写。  
> 角色锚定：发布者 · 页面：`pages/task-detail/task-detail` · **唯一核心任务：审阅收集进度并决定生成排班方案**

---

## 0. 锚定

| 项 | 内容 |
|----|------|
| 角色 | 发布者 |
| 路由 | `pages/task-detail/task-detail` |
| 唯一核心任务 | 审阅收集进度并决定生成排班方案 |
| 非目标 | 不在本页改班表格子；不在本页处理加入者异议终审（仅入口） |
| 入口 | 任务 Tab 列表点击任务卡片 |
| 成功出口（生成） | `scheme-gen` |
| 取消出口 | `navigateBack` 回任务列表 |

---

## 1. 布局全局（摘要）

1. 顶栏：任务标题截断 + 返回  
2. 状态条：收集中 / 待确认 / 已公示 + 进度 `已填/应填`  
3. 主卡片列表：查看成员填写 · 成员预设 · **生成排班方案（主 CTA）**  
4. 次要：分享提醒填写（文字按钮）  
5. **焦点**：主 CTA「生成排班方案」  
6. 首屏：`GET /tasks/:id` + `GET /tasks/:id/fill-progress`；任一带详情失败 → 错误态整页  
7. 骨架：状态条 + 三行 cell；空：无（详情失败用错误，不用空列表）

---

## 2. 共用组件参数（摘要）

| 组件 | 固定参数 |
|------|----------|
| Dialog 确认生成 | 宽 80%；圆角 12px；标题 16/600/#1F2329；正文 14/#646A73；主按钮高 44、`#2B6DE5` 白字「开始生成」；次按钮描边「取消」；遮罩 `rgba(0,0,0,.45)` 点击不关闭 |
| Toast | 成功 2s 居中；失败 2.5s；loading 不自动关 |
| 按钮 loading | 主按钮内 spinner，文案改为「提交中」 |

---

## 3. 逐按钮状态机（示例 2 个）

#### btn_gen_scheme · 生成排班方案

- **控件类型**：主 button  
- **默认样式**：实心 primary `#2B6DE5`，高 44，圆角 8，字 16/600 白  
- **前置不可用条件**  
  1. 任务状态 ∉ {收集中, 待确认}（已公示/已关闭）→ disabled，旁注「已公示不可再生成」  
  2. 已填人数 = 0 → disabled，旁注「至少 1 人填写后再生成」  
  3. 本页有 in-flight 生成请求 → disabled  
- **可点时：触发**  
  - 打开确认 Dialog → 点「开始生成」  
  - 按钮 loading + Dialog 主按钮 loading  
  - `POST /tasks/:id/schemes:generate`，header 带 `If-Match: version`  
  - 防抖：in-flight 锁至返回  
- **分支 A · 成功**  
  - UI：关 Dialog；Toast「方案生成中」；主按钮恢复  
  - 刷新：任务状态字段 →「生成中」；进度条可保留  
  - 可逆：生成完成前任务详情可返回列表；不可「撤销生成中」  
  - 导航：`navigateTo scheme-gen?taskId=`  
  - TC：`TC-task-detail-gen-A`  
- **分支 B · 业务失败**  
  - 例：code=`FILL_INCOMPLETE` → Dialog「仍有成员未填，仍要生成吗？」仅当产品允许强生；若不允许 → Toast/Dialog「未达生成条件：{服务端 msg}」，留在本页  
  - 例：code=`VERSION_CONFLICT` → Dialog「任务已更新」主按钮「刷新」→ 重拉详情  
  - 刷新：冲突时整页详情；其它失败不刷已填表单（本页无表单则仅状态条）  
  - 可逆：关闭 Dialog 继续浏览  
  - TC：`TC-task-detail-gen-B-fill` / `TC-task-detail-gen-B-version`  
- **分支 C · 网络异常**  
  - UI：关 loading；Toast「网络异常，请重试」  
  - 刷新：无  
  - 可逆：主按钮可再次点击  
  - TC：`TC-task-detail-gen-C`

#### btn_view_fills · 查看成员填写

- **前置不可用**：任务详情未加载成功 → disabled  
- **触发**：`navigateTo publisher-review?taskId=`（本地可先用缓存进度）  
- **A 成功**：进入审阅页（本页无接口或仅预取成功）  
- **B 业务失败**：预取失败 Toast「暂时无法查看：{msg}」，不跳转  
- **C 网络**：Toast「网络异常」，不跳转  
- TC：`TC-task-detail-view-A|B|C`

---

## 4–5. 空态 / 边界（摘要）

| 场景 | 规则 |
|------|------|
| 骨架 | 详情返回前显示 |
| 进页非发布者 | Toast「仅发布者可管理任务」+ navigateBack |
| 重复点生成 | in-flight 锁 |
| 标题超长 | 顶栏单行省略，详情卡内完整 |

---

此示例说明**粒度**；真实交付须把本页全部按钮按第三节模板写全。
