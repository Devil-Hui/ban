# UI项目完整交接文档

> **文档核心目标**：粘贴到新 AI 聊天窗口后，可 **100% 无缝接手** 继续完成 UI 优化、页面复刻、样式修改、交互迭代、适配兼容、细节整改，无需上下文回溯。  
> **原则**：基于本仓库真实内容；不确定处标注【不确定】；禁止空泛套话。  
> **生成日期**：2026-07-18  
> **项目根目录**：`D:\排班小程序`

---

## 1. 项目基础信息（UI专属）

### 项目名称

**排班协同**（排班小程序 / 排班协同平台）

### 端类型

- **主端**：微信小程序（`miniprogram/`）
- **辅端**：H5 运维后台 / 公开分享预览（设计文档有，本 UI 交接以小程序视觉与交互为主；H5 像素稿【不确定是否已出独立设计稿】）
- **设计交付介质**：draw.io 手机界面设计图（**一页一屏**）

### 用户体验优化方向（已定稿）

| 方向 | 落地标准 |
|------|----------|
| 气质 | 冷静像飞书日历，可靠像微信原生，密度像 Linear；**不是**彩虹运营页 |
| 签名视觉 | **Duty Grid（班表格子）**：星期 × 节次/时间段，选中/有班/空格/午休语义清晰 |
| 信息架构 | 一屏一主操作；Tab 固定 4 项：首页 / 日程 / 任务 / 我的 |
| 角色 | 小程序内 **发布者 publisher** 与 **加入者 joiner**；权限由 `group_members.role_in_group` 决定 |
| 反 slop | 禁止彩虹渐变顶栏、多色圆标墙、大阴影玻璃拟态、无意义 01/02/03 装饰编号 |

### 当前 UI 阶段

**设计整改中 / 线框定稿推进中**

- 逻辑分层：已有 `docs/logic-layers-design.md`
- 手机设计图：已有 31 页一屏一页 `docs/ui-design-phones.drawio`（机框复刻原型零件）
- 用户原始原型：根目录 `未命名绘图.drawio`（构图精彩，缺后半链路）
- **逐页「布局+组件参数+按钮状态机」全文**：仅有模板 + task-detail 示例，**多数页面未写完**
- 小程序代码：`miniprogram/pages/*` 已有 WXML/WXSS 实现，与设计图 **未全部像素对齐**【需逐页对照】

### UI 技术栈 / 组件体系

| 层 | 选型 |
|----|------|
| 小程序基础 | 原生 WXML / WXSS / JS，`style: "v2"`（`app.json`） |
| 全局 Token | `miniprogram/app.wxss` **v4 设计系统**（CSS 变量） |
| 组件库意向 | WeUI 原生感 + TDesign Mini Program（skill 已装；**业务页是否已全面接入 TDesign 组件【不确定，当前多为自研 class】**） |
| 业务组件 | `miniprogram/components/group-card` · `schedule-view` · `task-card` |
| 设计图 | draw.io（MCP `@drawio/mcp` + 插件 `drawio@drawio`） |
| 设计 Skills | 见第 3 节 |

### 适配与设计稿基准

| 项 | 值 |
|----|-----|
| 主适配 | 微信小程序手机端（非 PC 响应式） |
| 设计手机框 | **200 × 390**（`mxgraph.android.phone2`，与用户原型一致） |
| 屏内容区 | 相对机框 **(10, 35) 181.5 × 316** |
| 底栏区 | **(9.5, 333) 180.5 × 21.37**，`opacity=10` |
| FAB | **(82.75, 309) 40×40** |
| Tab 图标 | **26×26**，y=**330.68**，x=10 / 61 / 113 / 164 |
| rpx 基准 | 小程序标准 750 设计宽心智；代码用 rpx（见 app.wxss） |
| 平板/PC | 非目标；H5 分享页另册【不确定视觉稿是否齐全】 |

### 层级 / 圆角 / 阴影 / 间距规范（产品 v4 + 设计 skill）

见 **第 5 节全局 UI 规范配置清单**（以 `app.wxss` 为准，skill 中部分 hex 为语义对照）。

### 运行预览环境

| 环境 | 方式 | 状态 |
|------|------|------|
| 小程序本地 | 微信开发者工具打开 `miniprogram/`（`project.config.json`） | 需真实 AppID；禁止 `touristappid`（见 `logic-data-chain-optimization.md` §0） |
| 后端联调 | `backend` + 前端 `utils/config.js` → `http://127.0.0.1:3000/api/v1` | 【不确定】当前机器是否常驻启动 |
| 设计图预览 | draw.io 桌面版打开 `docs/ui-design-phones.drawio`，**左侧切换 31 页** | 浏览器 `#create=` 只能看单页 |
| 设计图快捷 | `docs/ui-design-phones-open.html` | 链到各页（体积大时不如桌面版） |
| 用户原型 | 根目录 `未命名绘图.drawio` | 参考构图，勿覆盖 |

### 是否包含动态交互

**是（设计+代码层面均涉及）**

| 类型 | 说明 |
|------|------|
| 点击 / 跳转 | `navigateTo` / `switchTab` / `navigateBack`；Tab 四入口 |
| 按钮 loading | 写操作 in-flight 锁（交互规范强制） |
| 弹窗 / 确认 | Dialog（生成方案确认、踢人等） |
| 列表展开 | 成员展开等 |
| 轮询 | 方案生成 job 1s×30 |
| 过渡动画 | 产品要求克制；大动效禁止；【不确定】各页 transition 是否统一 |
| hover | **小程序无 hover**；PC H5 另说 |

### 是否包含多端适配

- **手机小程序**：是（主）
- **平板 / PC Web 响应式**：**否（非本阶段目标）**
- **H5 分享只读**：有产品设计，视觉以功能脱敏表为主

### 是否涉及自定义动画、动效逻辑

- **有限**：骨架闪烁、Toast、按钮 loading、可选页面切换
- **禁止**：霓虹、强视差、复杂 Lottie 作为默认规范
- 自定义动画文件：【不确定】无独立 `animate.wxss`；多为组件内样式

### 是否有线上 UI 展示版本

- 【不确定】是否已发布体验版/正式版小程序  
- 设计侧「定稿」：**视觉方向定稿（v4 + Duty Grid + 反 slop）**；**全页交互规格未定稿**

---

## 2. 当前UI项目整体进度（按页面/模块拆分）

### 统一模块格式说明

- **视觉状态**：设计图 / 代码 / 对齐度  
- **交互状态**：三层规格（布局+组件+按钮状态机）是否写完  
- **适配状态**：小程序手机端（主）  
- **已验证 / 半成品 / 不可行方案**：据实填写  

---

### 2.0 全局设计系统

| 项 | 状态 |
|----|------|
| 视觉状态 | **已定稿方向**：`app.wxss` v4 + weui skill |
| 交互状态 | 发布者三层输出规范 **已定稿**（skill+模板） |
| 适配状态 | Token 用 rpx，手机正常心智 |
| 已完成 | CSS 变量、工具 class、反 slop 清单、Duty Grid 签名定义 |
| 未完成 | 设计 Token 与代码 token 对照表中「成功色」不一致（见 2.0.1） |
| 已验证可用 | 主色 `#2B6DE5`、背景 `#F7F8FA`、Tab selectedColor 与 app.json 一致 |
| 做到一半 | 设计图线框黑描边 vs 代码柔和卡片阴影 **两套表达并存** |
| 已验证不可行 | 彩虹渐变/多色光斑「加料」方向（用户反馈后废弃） |

#### 2.0.1 已知 Token 分歧（接手必读）

| 语义 | `app.wxss`（代码真源） | weui skill 文档 | 设计图现状 |
|------|------------------------|-----------------|------------|
| success | `#6BC785` | `#07C160`（微信绿） | 线框多为黑描边，少填色 |
| warning | `#F2B962` | `#FA9D3B` | 线框黑描边 |
| danger | `#E88B8B` | `#FA5151` | 邀请码错误用原型色 `#fad9d5`/`#ae4132` |

**接手约定**：实现小程序样式时 **以 `app.wxss` 为准**；分享/加入成功 CTA 若要微信绿，需产品确认后改 token，禁止 silent 双轨。

---

### 2.1 设计图交付 `ui-design-phones.drawio`（31 页）

| 项 | 状态 |
|----|------|
| 视觉状态 | **一页一手机**线框设计图已生成；机框零件复刻用户原型 |
| 交互状态 | 图内 **无完整按钮状态机**（状态机在文档模板） |
| 适配状态 | 固定 200×390 框，非多分辨率 |
| 已完成 | 31 个独立页签（见下表） |
| 未完成 | 与真实 WXML 像素级一致、空态/加载/错误多稿、高保真填色 |
| 已验证可用 | 桌面 draw.io 打开可切换 31 页；含原型 Tab SVG |
| 做到一半 | 屏内 UI 为线框结构，不是最终视觉稿 |
| 不可行 | 浏览器一次打开全部 31 页（应用桌面版页签） |

#### 31 页清单（页名 = 设计图 diagram name）

| # | 设计图页名 | 对应路由/概念 | 视觉 | 交互规格 |
|---|------------|---------------|------|----------|
| 01 | 授权登录 | `pages/auth/auth` | 线框有 | 未写三层全文 |
| 02 | 首页 | `pages/index/index` | 线框有（问候/统计/快捷/分组） | 未写 |
| 03 | 首页空态 | index 空分组 | 线框有 | 未写 |
| 04 | 日程 | `pages/schedule/schedule` | 线框有 | 未写 |
| 05 | 日详情 | schedule 钻取 | 线框有 | 未写 |
| 06 | 任务列表 | `pages/task/task` | 线框有 | 未写 |
| 07 | 我的 | `pages/profile/profile` | 线框有 | 未写 |
| 08 | 模板样式卡 | 原型「样式1叠卡」 | 线框有 | 未写 |
| 09 | 选择样式 | `pages/style-select/style-select` | 线框有 | 未写 |
| 10 | 节次模板编辑 | `pages/cal-edit-period/cal-edit-period` | 线框有 | 未写 |
| 11 | 时间轴模板 | `pages/cal-edit-time/cal-edit-time` | 线框有 | 未写 |
| 12 | 自定义模板 | `pages/cal-edit-custom/cal-edit-custom` | 线框有 | 未写 |
| 13 | 加入入口 | join 入口心智 | 线框有 | 未写 |
| 14 | 输入邀请码 | `pages/join/join` | 线框有 | 未写 |
| 15 | 邀请码错误 | join 失败态 | 线框有（原型色） | 未写 |
| 16 | 创建分组 | index/建组流 | 线框有 | 未写 |
| 17 | 新建任务 | `pages/task-create/task-create` | 线框有（步骤） | 未写 |
| 18 | 任务详情-收集中 | `pages/task-detail/task-detail` | 线框有 | **有示例节选** |
| 19 | 任务详情-已公示 | 同上状态变体 | 线框有 | 示例未覆盖全按钮 |
| 20 | 审阅成员填写 | `pages/publisher-review/publisher-review` | 线框有 | 未写 |
| 21 | 方案生成中 | `pages/scheme-gen/scheme-gen` | 线框有 | 未写 |
| 22 | 方案预览 | `pages/scheme-preview/scheme-preview` | 线框有 | 未写 |
| 23 | 公示结果 | `pages/public-result/public-result` | 线框有 | 未写 |
| 24 | 分组详情 | `pages/group-detail/group-detail` | 线框有 | 未写 |
| 25 | 成员管理 | `pages/members/members` | 线框有 | 未写 |
| 26 | 排班规则 | `pages/schedule-rules/schedule-rules` | 线框有 | 未写 |
| 27 | 标记空闲 | `pages/task-mark` / `joiner-fill` | 线框有 | 未写 |
| 28 | 排班回执 | `pages/schedule-receipt/schedule-receipt` | 线框有 | 未写 |
| 29 | 异议处理 | `pages/objection/objection` | 线框有 | 未写 |
| 30 | 我的日历 | `pages/calendar-manage/calendar-manage` | 线框有 | 未写 |
| 31 | 分享邀请码 | `pages/share-preview/share-preview` | 线框有 | 未写 |

**代码有、设计图表未单列的页面**：`member-preset`、`group`（若与 group-detail 合并则【不确定】）、`task-mark` 与 `joiner-fill` 可能同构【需产品确认是否两套 UI】。

---

### 2.2 用户原始原型 `未命名绘图.drawio`

| 项 | 状态 |
|----|------|
| 视觉状态 | **用户手绘精彩线框**；单页大画布；10 个 phone2 |
| 交互状态 | 箭头部分 target 为空，链路不完整 |
| 已完成 | 导航四入口、模板样式1/2/3、三模式对照表、日程7×5、邀请成功失败、AI 识别、创建分组入口 |
| 缺失（已在 31 页中补设计位） | 授权、分组驾驶舱、成员踢黑、新建任务步骤、任务详情进度、审阅、生成/预览/公示、规则、异议、日历等 |
| 注意 | **禁止覆盖此文件**；只读参考 |

---

### 2.3 逻辑分层文档

| 项 | 状态 |
|----|------|
| 文件 | `docs/logic-layers-design.md` |
| 状态 | **已完成 v1**（L0–L6 + 横切 + 页面矩阵 P0–P3） |
| 用途 | 决定「这页属于哪层、唯一任务是什么」 |

---

### 2.4 发布者交互规格体系

| 项 | 状态 |
|----|------|
| Skill | `.claude/skills/publisher-interaction-spec/SKILL.md` **已完成** |
| 空白模板 | `docs/templates/publisher-interaction-page-spec.md` **已完成** |
| 示例 | `docs/templates/example-task-detail-publisher-spec.md` **节选**（入门） |
| 全文规格 | `docs/specs/publisher-task-create-interaction.md` · `publisher-task-detail-interaction.md` · `publisher-scheme-gen-interaction.md` · `publisher-scheme-preview-interaction.md` **P0 已齐** |
| 全站其余页面三层全文 | **未完成**（P1：index/share/group-detail/style-select 等） |

---

### 2.5 小程序实现页（代码侧 UI）

| 模块 | 视觉状态 | 交互状态 | 适配 | 备注 |
|------|----------|----------|------|------|
| Tab 四页 index/schedule/task/profile | 有完整 WXML/WXSS | 有业务逻辑 | 手机 | index 与设计图结构接近 |
| task-create | 有 stepper 实现 | 有 | 手机 | 应对齐设计图 17 |
| task-detail | 有 hero+时间线 | 有 | 手机 | 应对齐 18/19；规格示例基于此 |
| join | 有 | 有 | 手机 | 成功/失败态要对齐原型色 |
| cal-edit-* | 有 | 有 | 手机 | Duty Grid 实现核心 |
| scheme-* / public-result | 有 | 有 | 手机 | 设计图线框级 |
| 其余 pages/* | 有目录 | 【不确定】完成度不一 | 手机 | 接手时按路由打开对照 |

---

### 2.6 已验证不可行的视觉方案（禁止回潮）

1. **彩虹渐变顶栏 + 粉青紫光斑 + 多色圆标墙**（用户：「太素」后又否定加料方向；最终回到 WeUI 单主色）  
2. **一页塞 4 个手机当「全部页面」**（用户只看到 4 页；已改为 31 页一屏一页）  
3. **纯文字段落当设计交付**（用户：「我要的是设计图不是文字段落」）  
4. **touristappid 游客包当可预览登录 UI**（登录链路废；见逻辑链文档）

---

## 3. UI资源&文件结构说明

格式：路径 · 类型 · 作用 · 状态 · 修改注意

---

### 3.1 设计图与原型

| 路径 | 类型 | 作用 | 状态 | 修改注意 |
|------|------|------|------|----------|
| `未命名绘图.drawio` | 设计稿/原型 | 用户原始线框，构图与机框参考源 | 正常·只读参考 | **禁止覆盖**；Tab 图标 SVG 数据源 |
| `docs/ui-design-phones.drawio` | 设计稿 | **主交付**：31 页一屏一手机 | 正常·线框级 | 改 UI 改此文件；保持机框零件参数 |
| `docs/ui-design-phones-open.html` | 预览辅助 | 浏览器打开单页链接目录 | 可用 | 不当事源；可再生成 |
| `docs/_phone_assets.json` | 资源 | 从原型抽出的 phone/screen/tabbar/图标 style | 正常 | 复刻机框时读取；勿手改 SVG 除非换图标 |

---

### 3.2 规范与逻辑文档

| 路径 | 类型 | 作用 | 状态 | 修改注意 |
|------|------|------|------|----------|
| `docs/logic-layers-design.md` | 逻辑设计 | L0–L6 层、页面唯一任务、P0–P3 | 正常 | 改信息架构先改此文 |
| `docs/logic-data-chain-optimization.md` | 逻辑/数据/按钮 | 按钮→API→表；touristappid 修复 | 正常 | 改交互数据流对照此文 |
| `docs/business-flows.md` | 业务 | 角色、表、流程 v3.5 | 正常 | 业务口径真源 |
| `docs/api-spec.md` | API | 接口契约 | 正常 | 按钮状态机 API 名以此为准 |
| `docs/user-scenarios.md` | 场景 | 13 用户场景 | 正常 | 验收故事 |
| `docs/implementation-plan.md` | 工程 | H5/一致性/配置 | 正常 | 非视觉主文档 |
| `docs/flow-review-report.md` | 审查 | 历史问题清单 | 参考 | 可能含已修项 |

---

### 3.3 交互规格模板

| 路径 | 类型 | 作用 | 状态 | 修改注意 |
|------|------|------|------|----------|
| `docs/templates/publisher-interaction-page-spec.md` | 模板 | 发布者页三层空白卷 | 正常 | 每页复制新建 |
| `docs/templates/example-task-detail-publisher-spec.md` | 示例 | task-detail 粒度示范 | 正常 | 扩写勿删结构 |

---

### 3.4 小程序样式与页面

| 路径 | 类型 | 作用 | 状态 | 修改注意 |
|------|------|------|------|----------|
| `miniprogram/app.wxss` | 全局样式 | **v4 Token 真源** | 正常 | 改色/间距优先改变量 |
| `miniprogram/app.json` | 配置 | 页面路由、window、tabBar 色 | 正常 | Tab 文案/色与设计一致 |
| `miniprogram/app.js` | 逻辑 | 启动登录等 | 正常 | 影响首屏态 |
| `miniprogram/pages/*/` | 页面 | 每页 wxml/wxss/js/json | 参差 | 改 UI 同时对设计图页号 |
| `miniprogram/components/*/` | 组件 | group-card、schedule-view、task-card | 正常 | Duty Grid 可能在 schedule-view |
| `miniprogram/assets/tab/*` | 图标 | Tab 图标 png | 正常 | 与设计图 SVG 来源不同，以代码资源为准上线 |
| `miniprogram/utils/config.js` | 配置 | BASE_URL 等 | 正常 | 预览联调 |
| `miniprogram/utils/request.js` | 请求 | 401/Toast | 正常 | 影响错误反馈 UI |

---

### 3.5 Skills / 工具（接手 AI 必装认知）

| 路径/名称 | 类型 | 作用 | 状态 | 修改注意 |
|-----------|------|------|------|----------|
| `.claude/skills/weui-miniprogram-ui/` | Skill | 视觉规则、Token、反 slop、drawio 线框规则 | 正常 | 与 app.wxss 冲突时以代码为准并回写 skill |
| `.claude/skills/publisher-interaction-spec/` | Skill | 发布者三层强制输出 | 正常 | 任何后台交互页先走此 skill |
| `~/.claude/skills/interface-design/` | Skill | 层级/密度/反 AI 默认 | 已装 | 全局 |
| `~/.claude/skills/tdesign-miniprogram/` | Skill | TDesign 组件用法 | 已装 | 引入组件时用 |
| MCP `drawio` | 工具 | open_drawio_xml/mermaid 等 | Connected | 打开预览；大文件用桌面版 |
| 插件 `drawio@drawio` | 工具 | 写 .drawio / 导出 | enabled | 可选 Desktop |
| 插件 `frontend-design` | 工具 | 防模板化视觉 | enabled | |

---

### 3.6 动画 / 响应式专用文件

| 路径 | 状态 |
|------|------|
| 独立 animate 样式文件 | **无**【不确定是否组件内零散 transition】 |
| 响应式断点样式 | **无**（非 H5 响应式项目） |

---

### 3.7 已删除的过期设计产物（勿找回当真源）

以下曾生成后按用户要求删除或覆盖，**不要恢复当主设计**：

- `docs/ui-award-coverage-phones.drawio`（多版迭代）  
- `docs/ui-full-coverage-phones.drawio`  
- `docs/logic-layers-full.drawio`（架构图，非手机 UI）  
- 各类临时 `_gen_*.py` 生成物  

当前设计图真源仅：`docs/ui-design-phones.drawio` + 原型 `未命名绘图.drawio`。

---

## 4. 核心UI设计&交互逻辑说明

### 4.1 为什么这套配色/布局/风格

| 决策 | 原因 |
|------|------|
| 雾霾蓝单主色 | 工具属性、与 Tab selectedColor 统一、反运营风 |
| 灰白结构 60/30/10 | interface-design 密度与克制；衬托 Duty Grid |
| 线框黑描边设计图 | 用户原型语言；便于评审结构，非最终视觉填色 |
| 一页一手机 | 用户明确「至少 20 页面」且拒绝四宫格 |
| 发布者三层规格 | 用户要求每条路径可转测试用例 |

### 4.2 页面层级结构逻辑

```
┌ 微信胶囊（系统，不可挡）
├ 导航栏（白底 #FFFFFF，标题黑）
├ 主内容（背景 #F7F8FA，可滚动）
│   ├ 焦点区（今日班次 / 主表单 / Duty Grid / 主 CTA）
│   └ 次要列表/信息
├ 底部 Tab（四项，高约 50px 心智；设计图用原型底栏+图标）
└ 弹层：Dialog / ActionSheet / Toast（高于页面）
```

设计图机组层级（复刻参数）：

```
group
 ├ phone2 外壳
 ├ screen 内容底（10,35,181.5×316）
 ├ [业务 UI 画在 group 坐标]
 ├ tabbar 半透明条
 ├ FAB 40×40（部分页）
 └ 4× tab icon 26×26
```

### 4.3 全局交互逻辑

| 模式 | 规则 |
|------|------|
| Tab | `switchTab`：首页/日程/任务/我的 |
| 二级页 | `navigateTo`；返回 `navigateBack` |
| 写操作 | ensureLogin → 校验 → loading → API → A/B/C 三分支 |
| 主按钮 | 每页最多一个实心主 CTA |
| 列表行 | 整行可点进详情；右 chevron |
| 失败 | 业务失败保留输入；网络失败可重试 |
| 生成方案 | 异步 job 轮询，禁止当同步长请求无反馈 |

### 4.4 间距 / 边距统一规则

| 场景 | 建议（设计） | 代码 |
|------|--------------|------|
| 页边距 | 设计框内约 14–18px | `--s-md` 24rpx 等 |
| 卡片间距 | 8–12 | gap-sm / 16rpx |
| 卡片内边距 | ~12 | 对照各页 wxss |
| 主按钮高 | 40–44 | 设计 36–44 线框 |
| 触控 | ≥44px | 列表行 |

**【不确定】** 全站是否已统一 8pt 网格扫描；接手改 UI 时以 app.wxss 间距变量收敛。

### 4.5 容易出 UI bug 的位置

| 位置 | 风险 |
|------|------|
| 微信胶囊与顶栏 | 自定义顶栏遮挡胶囊 |
| Duty Grid | 格子错位、午休带高度、选中态对比不足 |
| Tab 与安全区 | 底部内容被 Tab 挡住（需 `page-with-tab` 类预留） |
| 设计图 vs 代码图标 | 设计用原型 SVG，代码用 png assets |
| 双 Token 成功色 | 绿不一致导致验收扯皮 |
| 弹窗滚动穿透 | 小程序常见 |
| 长标题 | 顶栏截断与卡片全文不一致 |
| 状态切换 | collecting→published 主 CTA 未禁用 |

### 4.6 已迭代修改过的视觉问题与原因

| 迭代 | 原因 | 结果 |
|------|------|------|
| 粗糙四宫格线框 | 缺设计感 | 用户否定 |
| 加料彩虹版 | 「太素」后过度装饰 | 用户否定 |
| WeUI 单主色 | 对齐 skill+代码 | 方向定稿 |
| 架构图当 UI | 用户要手机设计图 | 改为 phone 图 |
| 文字交接当设计 | 用户要设计图 | 禁止 |
| 假机框 | 未复刻原型 | 抽取 `_phone_assets.json` 复刻 |
| 一页四机 | 用户只见 4 页 | 改为 31 页一屏一页 |

### 4.7 固定不能动的品牌/产品规范

1. 产品名：**排班协同**  
2. Tab 四项文案与顺序  
3. 主色 **`#2B6DE5`**（与 tabBar selectedColor）  
4. 背景 **`#F7F8FA`**、导航白底黑字  
5. **Duty Grid** 作为排班相关页签名元件  
6. 发布者交互必须走三层规格（不可只出一张静图）  
7. 用户原型文件不可覆盖  

### 4.8 推荐的结构优化（未做完）

- 将 31 页设计图逐步 **填色到 app.wxss token**（仍一页一屏）  
- 为 P0 页补全三层规格全文：`task-create`、`task-detail`、`scheme-preview`  
- 统一 success/warning/danger 文档与代码  
- `member-preset` 补设计页  

---

## 5. 全局UI规范配置清单

### 规范：主色 Primary

- **规范名称**：Brand Primary  
- **值**：`#2B6DE5`（dark `#1F56C7` / darker `#1844A0`）  
- **适用场景**：主按钮、Tab 选中、链接、选中格子  
- **是否强制不可修改**：**是**（除非改 brand 全站）  
- **影响范围**：全局  

### 规范：主色浅底

- **值**：`#EAF1FF`（app 中 lighter；light `#8FB4F2`）  
- **场景**：选中行浅底、Hero 浅底、有班次格子  
- **强制**：建议是  
- **影响**：排班相关页  

### 规范：背景 / 卡片 / 边框

- **背景** `#F7F8FA` · **卡片** `#FFFFFF` · **边框** `#EEF0F3` · **分割** `#F0F2F5`  
- **强制**：是  
- **影响**：全局  

### 规范：文字色

- **主** `#1F2329` · **次** `#646A73` · **辅** `#8F959E` · **反白** `#FFFFFF`  
- **强制**：是  

### 规范：状态色（代码真源 app.wxss）

- **成功** `#6BC785`  
- **警告** `#F2B962`  
- **危险** `#E88B8B`  
- **信息** `#7EC8E3`  
- **强制**：实现以代码为准；文档 skill 微信绿为可选增强【待统一】  

### 规范：字体

- **字体栈**：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", sans-serif`  
- **字号（rpx）**：display 40 / title 32 / sub 28 / body 26 / cap 24 / tiny 22  
- **设计图 pt 约**：11–14 线框常用  
- **行高**：page 1.55  
- **强制**：是（实现）  

### 规范：圆角

- **sm 8rpx · md 12rpx · lg 16rpx · xl 24rpx · pill 999rpx**  
- **设计线框**：按钮/卡片常 0–1 rounded 贴近原型  
- **强制**：代码用变量；设计图可继续线框直角+小圆角  

### 规范：阴影

- **card**：`0 2rpx 12rpx rgba(31,35,41,0.04)`  
- **elevated**：`0 6rpx 20rpx rgba(31,35,41,0.06)`  
- **tab**：`0 -1rpx 8rpx rgba(31,35,41,0.04)`  
- **强制**：是；禁止重阴影  

### 规范：间距

- **xs 8 · sm 16 · md 24 · lg 32 · xl 48**（rpx）  
- **强制**：新样式优先变量  

### 规范：动画

- **原则**：克制；反馈清晰即可  
- **时长**：【不确定】未全局常量；建议 200–300ms ease  
- **禁止**：夸张动效  

### 规范：机框（设计图专用）

- **名称**：Prototype Phone Chrome  
- **值**：见 §1 适配表 + `_phone_assets.json`  
- **强制**：画新设计页时 **是**  
- **影响**：所有 draw.io 手机页  

### 规范：发布者交互输出

- **名称**：Three-Layer Interaction Spec  
- **强制**：**是**  
- **顺序**：锚定 → 布局全局 → 组件参数 → 逐按钮 A/B/C → 空态边界 → TC  
- **影响**：一切发布者后台/管理流页面  

---

## 6. 调试与验收方法（新 AI 必读）

### 页面本地预览启动方式

| 步骤 | 命令/操作 | 验证 |
|------|-----------|------|
| 1 | 微信开发者工具导入 `miniprogram/` | 编译成功 |
| 2 | 确认 AppID 非 tourist | 详情页 AppID 真实或占位 REPLACE_* |
| 3 | 后端 `backend` 启动（若联调） | `:3000` |
| 4 | 前端 BASE_URL 指向 `/api/v1` | 登录可通 |
| 5 | 开发者工具「不校验合法域名」本地 | 可请求 |

**已验证/未验证**：tourist 问题文档已写清；本交接机是否当场跑通【不确定】。

### 设计图查看方式（已验证）

1. 安装 draw.io 桌面版或 app.diagrams.net  
2. 打开 `docs/ui-design-phones.drawio`  
3. **切换 31 个页签**（关键！）  
4. 对照 `未命名绘图.drawio` 看机框是否一致  

### 样式修改生效方式

- 改 `app.wxss` 变量 → 全页刷新  
- 改页级 `*.wxss` → 保存后开发者工具自动编译  
- 改设计图 → 保存 drawio；HTML 预览需重导或重开  

### 缓存注意

- 开发者工具清缓存：工具 → 清除缓存工具  
- 设计图浏览器预览易缓存旧 `#create=` URL → **优先本地文件**  

### PC 端调试分辨率

- 非主目标；若 H5：【不确定】常用 1440/1920  
- 小程序：模拟器 iPhone 多尺寸扫一遍  

### 移动端适配调试

- 开发者工具多机型  
- 真机预览（需合法 AppID/域名）  
- 检查 Tab 遮挡、胶囊遮挡、横滑格子  

### 效果测试步骤（建议）

1. 对照设计图页号 vs 路由打开真页  
2. 检查主 CTA 唯一性与颜色  
3. 走发布者主路径：建组→模板→邀请→建任务→生成→公示  
4. 走加入者：邀请码成功/失败→填空闲→回执→异议  
5. 断网点写按钮 → 必须有 C 分支反馈  
6. 空分组进首页 → 空态与设计图 03 一致  

### UI 验收标准

| 标准 | 说明 |
|------|------|
| 视觉对齐 | 结构区块与设计图一致；色走 app.wxss |
| 交互流畅 | 主路径无死点；loading 可见 |
| 无错位 | Grid 不碎、Tab 不挡、胶囊不挡 |
| 多端统一 | 多机型 Tab/安全区正常 |
| 可测 | 发布者页具备或可补全 A/B/C TC |

---

## 7. 已知UI问题、BUG、踩坑记录

### 问题 1：设计图与代码成功色不一致

- **类型**：配色规范冲突  
- **现象**：文档写微信绿，代码用 `#6BC785`  
- **场景**：分享/成功按钮验收  
- **原因**：skill 与 app.wxss 未收敛  
- **已尝试**：skill 注明微信绿；代码未改  
- **状态**：**未解决**  
- **无效方案**：各写各的  
- **涉及**：`app.wxss`、`weui-miniprogram-ui/SKILL.md`  
- **接手步骤**：产品定一个 success → 改 token + skill + 设计图  

### 问题 2：一页多机导致「只有 4 页」误解

- **类型**：交付结构  
- **现象**：用户只看到 4 个界面  
- **原因**：四宫格排版  
- **状态**：**已解决**（31 页一屏一页）  
- **禁止**：再合并多机到一页当全集  

### 问题 3：假机框未复刻原型

- **类型**：视觉还原  
- **现象**：用户认为「手机框架根本没设计」  
- **原因**：自绘黑壳而非 phone2+#c0c0c0+原图标  
- **状态**：**已缓解**（`_phone_assets.json` 复刻）  
- **接手**：新页必须 `phone_group` 参数一致  

### 问题 4：原型邀请码链路箭头 target 为空

- **类型**：原型交互不完整  
- **文件**：`未命名绘图.drawio`  
- **状态**：已知；补页已画失败/成功态  
- **接手**：勿以为原型箭头完整  

### 问题 5：touristappid 导致登录 UI 无法真机验收

- **类型**：环境/联调  
- **状态**：文档已给修复清单；是否已改本地配置【不确定】  
- **涉及**：`project.private.config.json`、`project.config.json`  

### 问题 6：多数页面无三层交互规格全文

- **类型**：交互文档缺口  
- **状态**：**未解决**（最高优先级）  
- **接手**：按 P0 复制模板开写  

### 问题 7：设计线框黑边 vs 代码柔和卡片

- **类型**：视觉双轨  
- **状态**：可接受阶段态；最终实现跟代码 token  
- **禁止**：把线框黑边当成品牌必须  

### 问题 8：draw.io 浏览器打不开超大页

- **类型**：预览限制  
- **现象**：含完整原图的合并文件 URL 过长  
- **方案**：桌面版打开本地文件  
- **无效**：反复生成超长 `#create=`  

---

## 8. 近期UI修改迭代记录

### 2026-07-18 · 安装设计工具链

- **修改原因**：需要精准 draw.io  
- **涉及**：MCP drawio、插件 drawio、interface-design/tdesign/frontend-design skills  
- **内容**：user scope 安装  
- **是否验收生效**：`claude mcp list` 显示 drawio Connected  
- **潜在影响**：无业务代码影响  

### 2026-07-18 · 逻辑分层文档

- **原因**：开始设计每个逻辑层  
- **涉及**：`docs/logic-layers-design.md`  
- **内容**：L0–L6、页面矩阵、P0–P3  
- **验收**：文档存在且可引用  
- **影响**：后续页面唯一任务口径  

### 2026-07-18 · 发布者三层交互规范

- **原因**：用户强制交互输出结构  
- **涉及**：skill + templates  
- **验收**：模板可复制  
- **影响**：所有发布者页文档格式  

### 2026-07-18 · 多版 draw.io 试错

- **原因**：用户否定粗糙/太素/加料/非手机图/假机框/四宫格  
- **涉及**：多文件生成后删除  
- **定稿**：**一页一屏 31 页** `ui-design-phones.drawio` + 原型保留  
- **验收**：用户仍可能要求更高保真填色  
- **影响**：勿恢复已删文件  

### 2026-07-18 · 机框资产抽取

- **原因**：复刻用户原型手机框  
- **涉及**：`docs/_phone_assets.json`  
- **内容**：phone/screen/tabbar/FAB/4 图标 style  
- **验收**：新图含 phone2 与 svg  
- **影响**：设计图体积变大（图标 data URI）  

---

## 9. 下一步UI迭代开发计划（优先级明确）

### 最高优先级（立即做）

#### 任务 A · P0 发布链路工程收敛 — **已完成（2026-07-18）**

- **已做**：
  - `scheme-preview.confirmScheme` → 真 `tasks.publish({ finalSchedule })` + publishing 锁
  - `scheme-gen.onPublish` → 同上
  - `task-detail.generateScheme` 成功后 **统一进 scheme-preview**（不再详情内直接 publish Modal）
  - 无真实 taskId / `T00*` 仍走演示跳转，不挡 UI 演示
- **仍待**：scheme-gen/preview 表格数据仍多为本地 mock；需接 candidate_schedules 真数据渲染
- **验收**：有真实 taskId 时发布必打 `/tasks/{id}/publish`；按钮显示「发布中…」  


#### 任务 B · 设计图与代码首页/任务详情对齐走查

- **迭代目标**：index、task-detail 结构零重大偏差  
- **涉及**：`pages/index/*`、`pages/task-detail/*`、设计图 02/18/19  
- **步骤**：并排设计图与模拟器 → 列 diff → 改 wxss/wxml 或改设计图  
- **验收**：区块顺序一致；主 CTA 文案一致  

### 第二优先级

#### 任务 C · 收敛 success/warning/danger Token

- **目标**：单一色板  
- **涉及**：app.wxss、skill、设计图填色  
- **验收**：文档=代码=设计  

#### 任务 D · Duty Grid 三模式视觉统一

- **目标**：cal-edit-time/period/custom 格子规范一致  
- **涉及**：设计图 10–12 + 对应 pages  
- **验收**：选中/有班/午休/空 四态可辨  

#### 任务 E · 补 `member-preset` 设计页

- **目标**：31 页矩阵无路由空洞  
- **验收**：新页签 + 路由可对照  

### 第三优先级

#### 任务 F · 线框升级为 v4 填色高保真

- **目标**：设计图使用 app.wxss 色与圆角阴影  
- **注意**：保持一页一屏；勿回彩虹  

#### 任务 G · H5 分享页视觉

- **目标**：脱敏排班表只读页  
- **【不确定】** 是否已有独立设计  

### 目前禁止修改的 UI 内容

1. 用户 `未命名绘图.drawio` 内容覆盖  
2. Tab 四项信息架构（除非产品变更评审）  
3. 主色 `#2B6DE5` 无全站方案时的乱改  
4. 恢复已否决的彩虹加料风格  
5. 把多机塞回单页充当「全站页面数」  

### 容易过度优化、无需改动的模块

- 逻辑分层文档结构性重写（已可用）  
- 为 H5 运维大屏做小程序同款 Tab  
- 在设计图写长篇说明文字（用户不要）  
- 无产品需求时上复杂动效库  

### 定稿声明

| 项 | 定稿？ |
|----|--------|
| 视觉方向 v4 + Duty Grid + 反 slop | **是** |
| 机框复刻参数 | **是** |
| 一页一屏 31 页交付形态 | **是** |
| 发布者三层交互写法 | **是** |
| 全页高保真填色 | **否** |
| 全页三层规格全文 | **P0 已齐**（create/detail/scheme-gen/preview 见 `docs/specs/`）；P1+ 未完成 |
| 设计=代码像素一致 | **否** |

---

## 10. 新 AI 接手 30 分钟清单

1. 读本文 §1–§2、§4.7、§9  
2. 打开 `docs/ui-design-phones.drawio` 浏览 31 页  
3. 打开 `未命名绘图.drawio` 理解用户审美  
4. 读 `app.wxss` 变量与 `app.json` Tab  
5. 读 `logic-layers-design.md` 主路径  
6. 复制交互模板，从 **task-detail 扩写全文** 或 **task-create** 开始  
7. 改 UI 时同步：设计图页 + 对应 `pages/*/`.wxss  

### 关键路径速查

```
设计图真源:  docs/ui-design-phones.drawio
用户原型:    未命名绘图.drawio
机框资产:    docs/_phone_assets.json
视觉 skill:  .claude/skills/weui-miniprogram-ui/SKILL.md
交互 skill:  .claude/skills/publisher-interaction-spec/SKILL.md
交互模板:    docs/templates/publisher-interaction-page-spec.md
逻辑分层:    docs/logic-layers-design.md
Token 真源:  miniprogram/app.wxss
路由真源:    miniprogram/app.json
```

---

## 11. 不确定清单汇总（【不确定】）

1. 是否已有线上/体验版小程序可扫码对照  
2. 业务页是否已 npm 接入 TDesign 组件（非仅 skill）  
3. `member-preset` 与 `task-mark`/`joiner-fill` UI 是否合并  
4. 全局 transition 时长常量  
5. H5 分享页是否有独立视觉稿  
6. 本机 backend 是否默认可联调  
7. project AppID 是否已从 tourist/占位换成真实值  
8. 成功色最终采用 app.wxss 还是微信绿  

---

**文档结束。** 新会话请从 §9 最高优先级 A/B 开工；改视觉打开 `ui-design-phones.drawio` 对应页号，改交互复制 publisher 模板。
