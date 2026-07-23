# 团队技术提升与代码质量把控方案

> **制定人**：资深开发工程师 (Senior Developer)
> **日期**：2026-07-22
> **适用项目**：智能排班小程序 (Smart Scheduling Platform)

---

## 一、代码审查总评

基于对项目 `apps/miniprogram/` 和 `services/api/` 的全面代码审查，项目整体架构设计良好（Monorepo + DDD 领域层 + NestJS 三层分离），但存在以下亟需改进的关键问题：

| 优先级 | 问题 | 严重程度 |
|--------|------|----------|
| 🔴 P0 | **零测试覆盖** — 前端小程序和后端 API 均无单元测试 | 致命 |
| 🔴 P0 | **无代码规范工具** — 缺少 ESLint/Prettier 约束 | 高 |
| 🟠 P1 | **task-create.js 上帝对象** — 763 行单文件，职责过重 | 高 |
| 🟠 P1 | **错误静默吞掉** — home.js 等多处 `catch` 无任何提示 | 高 |
| 🟡 P2 | **硬编码离线降级逻辑** — OFFLINE_FALLBACK 散布在页面中 | 中 |
| 🟡 P2 | **日期构造逻辑重复** — `buildDates` 与 `enumerateDates` 功能重叠 | 中 |
| 🟡 P2 | **schedule-grid 全量重建** — observers 无增量更新 | 中 |
| 🔵 P3 | **前端缺少 TypeScript** — 随代码量增长，类型错误风险上升 | 低 |
| 🔵 P3 | **后端 `any` 类型** — `share.controller.ts` 等位置使用 `any` | 低 |

---

## 二、P0 级别：立即修复（本周内完成）

### 2.1 引入自动化测试

**现状**：项目有完善的领域层纯函数（`domain/`、`utils/`、`logic.js`），但零测试覆盖。

**行动计划**：

#### 第一阶段：核心领域层单测（第1周）
```bash
# 小程序端 — 使用 Jest
cd apps/miniprogram
npm install --save-dev jest

# 优先覆盖纯函数模块
```
优先测试文件清单：
| 优先级 | 文件 | 理由 |
|--------|------|------|
| 1 | `domain/slot-selection.js` | 核心键值生成逻辑，所有网格操作依赖它 |
| 2 | `domain/period-builder.js` | 时段骨架生成，排班创建的基础 |
| 3 | `domain/date-defaults.js` | 日期默认值，影响所有排班时间计算 |
| 4 | `domain/name-parser.js` | 姓名解析，用户输入处理 |
| 5 | `utils/time-format.js` | 全项目共用，日期处理的多处使用 |
| 6 | `components/schedule-grid/logic.js` | 网格交互核心逻辑 |

```javascript
// 示例：slot-selection.test.js
const { slotKey, parseSlotKey } = require('../../domain/slot-selection');

describe('slotKey', () => {
  it('should generate key from date and period code', () => {
    expect(slotKey('2026-07-22', 'P1')).toBe('2026-07-22|P1');
  });

  it('should handle edge cases', () => {
    expect(slotKey('', 'P1')).toBe('|P1');
  });
});

describe('parseSlotKey', () => {
  it('should parse valid key', () => {
    expect(parseSlotKey('2026-07-22|P1'))
      .toEqual({ date: '2026-07-22', periodCode: 'P1' });
  });

  it('should handle malformed input', () => {
    expect(parseSlotKey('invalid')).toBeNull();
  });
});
```

#### 第二阶段：后端单测（第2周）
```bash
cd services/api
npm install --save-dev @nestjs/testing jest ts-jest
```

优先覆盖：
- `schedule.service.ts` 中的纯业务方法
- `auth.guard.ts` 的认证逻辑
- API 请求的输入校验

#### 第三阶段：关键流程集成测试（第3-4周）
- 排班创建 → 收集 → 求解 → 发布 的端到端流程
- 使用微信开发者工具的自动化测试能力

**验收标准**：
- 领域层测试覆盖率 > 80%
- 关键业务路径有集成测试
- CI 流水线中运行测试（`npm test` 通过才允许合并）

---

### 2.2 引入代码规范工具

**行动**：在 `apps/miniprogram/` 和 `services/api/` 分别添加 ESLint + Prettier 配置。

#### 小程序端配置

```json
// apps/miniprogram/.eslintrc.json
{
  "env": {
    "browser": true,
    "es2021": true,
    "commonjs": true
  },
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "globals": {
    "wx": "readonly",
    "App": "readonly",
    "Page": "readonly",
    "Component": "readonly",
    "getApp": "readonly",
    "getCurrentPages": "readonly"
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "warn",
    "no-empty": ["error", { "allowEmptyCatch": false }],
    "no-param-reassign": "warn",
    "prefer-const": "error",
    "eqeqeq": ["error", "always"]
  }
}
```

```json
// apps/miniprogram/.prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

#### package.json 添加脚本
```json
{
  "scripts": {
    "lint": "eslint . --ext .js",
    "lint:fix": "eslint . --ext .js --fix",
    "format": "prettier --write \"**/*.{js,json,wxss,wxml}\"",
    "format:check": "prettier --check \"**/*.{js,json,wxss,wxml}\""
  }
}
```

**验收标准**：
- `npm run lint` 零错误
- `npm run format:check` 通过
- 配置 Git pre-commit hook（使用 husky + lint-staged）

---

## 三、P1 级别：结构重构（第2-3周完成）

### 3.1 拆分 task-create.js 上帝对象

**现状**：`pages/task-create/task-create.js` 763 行，包含 catalog 加载、表单校验、向导逻辑、提交构建等所有逻辑。

**重构方案**：

```
pages/task-create/
├── task-create.js            # 页面入口，仅负责生命周期和数据绑定 (~120行)
├── task-create.wxml
├── task-create.wxss
├── logic/
│   ├── catalog-loader.js     # catalog 加载 + OFFLINE_FALLBACK (~60行)
│   ├── wizard-validator.js   # 每步的表单校验逻辑 (~80行)
│   ├── payload-builder.js    # buildCreatePayload 提交数据结构化 (~50行)
│   └── date-helpers.js       # buildDates 等日期构建辅助函数 (~40行)
└── constants/
    └── offline-fallback.js   # 离线降级数据 (~50行)
```

**迁移步骤**：
1. 创建 `logic/` 目录，先搬 `OFFLINE_FALLBACK` 到 `constants/offline-fallback.js`
2. 提取 `presetsFromApi`、`applyCatalog` 为 `logic/catalog-loader.js`
3. 提取 `validateStep1` ~ `validateStep6` 为 `logic/wizard-validator.js`
4. 提取 `buildCreatePayload` 为 `logic/payload-builder.js`
5. 提取 `buildDates`、`buildPaintTools` 为 `logic/date-helpers.js`
6. task-create.js 仅保留 `Page({})` 生命周期、事件绑定、setData 调用

---

### 3.2 修复错误静默吞掉

**反模式示例**（当前代码）：
```javascript
// ❌ home.js 第19行 — 错误被完全吞掉
api.request('/groups').then(/*...*/).catch(() => this.setData({ loading: false }));
```

**改进后**：
```javascript
// ✅ 统一的错误处理
api.request('/groups')
  .then((groups) => {
    this.setData({ groups, loading: false });
  })
  .catch((error) => {
    this.setData({ loading: false, errorMessage: api.errorMessage(error) });
    // 对于网络错误，保留已有数据不覆盖
  });
```

**建议**：在 `utils/api.js` 中增加一个包装函数：

```javascript
/**
 * 安全的页面数据加载包装器
 * @param {Object} page - Page 实例 (this)
 * @param {Function} fetcher - 返回 Promise 的请求函数
 * @param {Object} options
 * @param {string} options.loadingKey - loading 状态字段名 (默认 'loading')
 * @param {Function} options.onSuccess - 成功回调
 * @param {Function} options.onError - 错误回调 (可选)
 */
function safeLoad(page, fetcher, options = {}) {
  const { loadingKey = 'loading', onSuccess, onError, preserveOnError = false } = options;
  page.setData({ [loadingKey]: true });

  return fetcher()
    .then((data) => {
      if (onSuccess) onSuccess(data);
      page.setData({ [loadingKey]: false });
    })
    .catch((error) => {
      const msg = errorMessage(error);
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
      page.setData({ [loadingKey]: false });
      if (onError) onError(error, msg);
    });
}

// 使用
Page({
  load() {
    safeLoad(this, () => api.request('/users/me/schedule'), {
      onSuccess: (data) => this.setData({ assignments: data }),
    });
  },
});
```

---

## 四、P2 级别：代码质量提升（第3-4周完成）

### 4.1 消除日期构造逻辑重复

`task-create.js` 中的 `buildDates` 与 `utils/time-format.js` 中的 `enumerateDates` 功能相同但实现不同。

**行动**：统一使用 `enumerateDates`，废弃 `buildDates`。

```diff
// task-create.js
- const dates = buildDates(dateStart, dateEnd);
+ const { enumerateDates } = require('../../utils/time-format');
+ const dates = enumerateDates(dateStart, dateEnd, 7);
```

---

### 4.2 schedule-grid 增量更新优化

当前 `observers` 监听 6 个 properties，任何一个变化都触发全量 `rebuildGrid()`。

**改进**：

```javascript
// schedule-grid.js
observers: {
  'periods, dates'(periods, dates) {
    // 结构变化 → 全量重建
    this.rebuildGrid();
  },
  'selectedKeys'(keys) {
    // 选中状态变化 → 增量更新（仅标记选中）
    this.updateSelection(keys);
  },
  'peopleByKey'(people) {
    // 人员数据变化 → 只更新人员显示
    this.updatePeople(people);
  },
},
```

---

## 五、P3 级别：长期改进

### 5.1 渐进式 TypeScript 迁移

对于 `task-create.js` 等大型文件，考虑使用 JSDoc 类型注释作为过渡方案：

```javascript
/**
 * @param {string} dateStart - 开始日期 YYYY-MM-DD
 * @param {string} dateEnd - 结束日期 YYYY-MM-DD
 * @returns {{ date: string, weekday: string, label: string }[]}
 */
function buildDates(dateStart, dateEnd) { /*...*/ }
```

### 5.2 后端 `any` 类型修复

```typescript
// ❌ share.controller.ts
async create(@Body() body: any) { /*...*/ }

// ✅ 改进后
import { CreateShareDto } from './dto/create-share.dto';

async create(@Body() body: CreateShareDto) { /*...*/ }
```

---

## 六、Code Review 规范

### 6.1 MR/PR 审查清单

每份代码合并前必须通过以下清单：

- [ ] **功能正确性**：满足需求文档要求
- [ ] **无静默错误吞掉**：`catch` 块至少应 `wx.showToast` 或 `console.error`
- [ ] **纯函数已抽取**：超过 3 行的纯计算逻辑应从组件/页面中提取
- [ ] **无重复代码**：不引入与已有函数功能重复的新函数
- [ ] **CSS 规则完整**：无空的 `{ }` 规则块
- [ ] **URL 参数编码**：拼接 URL 时必须使用 `encodeURIComponent`
- [ ] **日期处理规范化**：使用 `utils/time-format.js` 中的函数，不外写日期格式逻辑
- [ ] **测试通过**：`npm test` 全绿（引入测试后）

### 6.2 关键审查点

| 代码位置 | 重点检查 |
|----------|----------|
| `pages/*/` 中的 `catch` 块 | 是否有 toast 或日志 |
| `api.request()` 调用 | 是否处理了 loading/error 状态 |
| URL 拼接 | 是否使用了 `encodeURIComponent` |
| 日期计算 | 是否使用了 `utils/time-format.js` 中的函数 |
| `setData` 调用 | 是否合并了可合并的调用 |

---

## 七、推荐工具链

| 工具 | 用途 | 安装位置 |
|------|------|----------|
| Jest | 单元测试 | `apps/miniprogram/` + `services/api/` |
| ESLint | JS/TS 静态分析 | 项目根 + 各子包 |
| Prettier | 代码格式化 | 项目根 + 各子包 |
| husky | Git hooks 管理 | 项目根 |
| lint-staged | 暂存区文件检查 | 项目根 |
| commitlint | Commit 信息规范 | 项目根 |

---

## 八、执行时间线

| 周次 | 任务 | 产出 |
|------|------|------|
| **第1周** | P0: 引入 ESLint/Prettier + 修复已有 lint 错误 | ESLint 配置通过，代码格式化一致 |
| **第1周** | P0: 领域层单测（slot-selection, period-builder, date-defaults） | 3+ 个模块的测试覆盖 |
| **第2周** | P0: 继续单测（name-parser, time-format, logic.js） | 6 个核心模块全测试覆盖 |
| **第2周** | P1: 拆分 task-create.js | 上帝对象拆分为 4-5 个小模块 |
| **第3周** | P1: 统一错误处理 + safeLoad 封装 | 全项目 catch 块规范化 |
| **第3周** | P2: 消除日期函数重复 + schedule-grid 优化 | 代码精简，性能提升 |
| **第4周** | P2+P3: 后端 any 类型修复 + CI 集成 | CI 流水线运行 lint + test |
| **持续** | Code Review 规范落地 | 所有 MR 经审查清单检查 |

---

## 九、总结

**一句话核心原则**：

> **每个 `catch` 都要有 toast，每段纯逻辑都该能测试，每个超过 300 行的页面都该拆分。**

当前项目有优秀的基础架构（DDD 领域层、NestJS 分层、完善的文档），但缺少工程化保障（测试、规范、静态分析）。补齐这些短板后，代码质量和团队协作效率将有质的飞跃。

---

*本文档为资深开发工程师基于项目代码深度审查后编写，建议团队主管组织评审后纳入团队开发规范。*
