# 智能排班 — 编码规范与惯例

## 环境准备

```bash
npm install                # 安装依赖（含 ESLint + Prettier）
npm run lint               # 代码检查
npm run lint:fix           # 自动修复
npm run format             # 格式化
npm run typecheck          # TypeScript 类型检查
```

## 微信开发者工具操作规范

**每次修改前端代码后必须执行：**

1. 开发者工具 → 菜单栏 → **清缓存** → **清除全部缓存**
2. 点击 **编译** 重新构建
3. 确认控制台无红色错误

**常见缓存问题症状：**
- 接口返回 404 但 curl 验证正常
- 页面样式不更新
- JS 报错行号与实际代码不符

## 样式规范 (WXSS)

### ❌ 禁止
```css
/* 标签选择器 — 组件页不允许 */
switch { }
button { }
view { }

/* 属性选择器 — 组件页不允许 */
.ui-btn[disabled] { }
.chip[data-key="range"] { }

/* CSS 变量用在组件属性 — 无效 */
<switch color="var(--brand)" />   /* 写 #1e9e5a */
```

### ✅ 正确
```css
/* 用 class 选择器 */
.break-toggle .switch-wrap { }

/* 颜色直接写值 */
<switch color="#1e9e5a" />
```

### 全局样式（见 app.wxss）
- `.state-box` / `.state-title` / `.state-subtitle` — 空状态
- `.modal-mask` — 弹窗遮罩
- `.btn-row` — 双按钮并排行
- `.surface` / `.pill` / `.mini-label` — 通用组件

## 接口规范

- 前端所有 API 路径以 `domain/api-types.js` 为准
- 后端路由以 NestJS 启动日志中的 `Mapped` 为准
- 前后端路径不一致是编译期 bug，必须对齐

## 微信开发者工具操作 🚨

```
改前端代码 → 清缓存 → 全部清除 → 重新编译 → 验证无红色错误
```

**常见症状（都是缓存引起的）：**
- 接口返回 404 但 curl 验证正常
- 页面样式不更新（改了半天没变化）
- JS 报错行号与实际代码不符
- switch/input 颜色异常

## 代码审查清单 (Code Review)

提交 PR 前必须自查：

- [ ] WXSS 无标签选择器（`input{}`、`switch{}`、`text{}`）→ 用 class
- [ ] WXSS 无属性选择器（`button[disabled]`）
- [ ] 组件属性无 CSS 变量（`color="var(--brand)"` → `color="#1e9e5a"`）
- [ ] 无重复样式（先检查 `common-styles.wxss` 是否已有）
- [ ] 无重复函数（先检查 `utils/` 和 `domain/`）
- [ ] API 路径与 `docs/api-routes.md` 对照表一致
- [ ] `npm run lint` 零错误
- [ ] `npm run typecheck` 零错误
- [ ] 微信开发者工具清除缓存后测试通过
- [ ] 新功能不与已有功能冲突

## 提交规范

```bash
# 提交前必须
npm run lint        # 代码检查（阻止重复代码、TS 错误）
npm run typecheck   # TypeScript 类型检查

# 自动修复
npm run lint:fix    # ESLint 自动修复
npm run format      # Prettier 格式化
```
- [ ] 没有重复样式（检查 app.wxss 是否已有）
- [ ] 没有重复函数实现（检查 utils/ 和 domain/）
- [ ] API 路径在 api-types.js 中有对应类型
- [ ] `tsc --noEmit` 零错误
- [ ] 微信开发者工具清除缓存后测试通过
- [ ] 新功能不与已有功能冲突

## 文件组织

```
apps/miniprogram/
  app.wxss          # 全局样式：复用组件样式放这里
  utils/            # 工具函数：api.js, time-format.js 等
  domain/           # 纯逻辑：period-builder, api-types 等
  pages/            # 页面：各自的 wxss 只写页面特有样式
  components/       # 组件
  constants/        # 常量
```
