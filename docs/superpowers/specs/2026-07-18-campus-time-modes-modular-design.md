# 校内时段三模式 · 双层作息 · 模块化解耦设计

> 版本: v1.0 | 日期: 2026-07-18  
> 状态: 待用户审阅后进入实现计划  
> 配套种子: `backend/seeds/schedule-profiles.seed.json` · 常量: `shared/time-constants.json`

---

## 1. 背景与目标

校内排班真实存在三种用法：

| mode | 含义 | 典型场景 |
|------|------|----------|
| `section` | 纯节次 | 只说「第3、4节有空」 |
| `range` | 纯时间段 | 社团值班 18:00–20:00 |
| `section_range` | 节次+时间段 | 「第1节 08:00–08:45」同时展示 |

**目标**

1. 三种 mode 一等公民，展示/编辑由元数据驱动，禁止页面魔法字符串。  
2. **双层作息**：平台系统模板（种子）+ 分组可导入/覆盖。  
3. **任务级快照**：创建时 resolve 后写入 `tasks.periods`，历史不被事后改作息污染。  
4. **硬编码最小化**：仅允许枚举键、默认 mode、种子 id；具体钟点全部来自配置/DB。  
5. **H5 运维模块化**：模板、设置、任务审计、分组覆盖全覆盖。  
6. 种子数据来自**多校公开作息众数**，非拍脑袋。

**非目标**：多租户 SaaS、拖拽智能排课、支付重构。

---

## 2. 种子数据策略（公开众数）

### 2.1 方法论

- 中国高校**无全国统一课表国标**，各校教务处自定。  
- 从多所高校官网公开「上课时间表/作息时间」归纳**众数**：  
  - 第1节多从 **08:00** 起  
  - 单节 **45 分钟**或 **50 分钟**两档最常见  
  - 节间约 5–10 分钟，上午常有更长大课间  
  - 下午多 14:00 档，晚上多 19:00 档  
- 种子仅作**可改默认值**；H5 可归档/覆盖；分组可导入后改。

### 2.2 种子清单（`backend/seeds/schedule-profiles.seed.json`）

| id | 名称 | 依据 |
|----|------|------|
| `sys_uni_45min_v1` | 高校标准·45分钟（**默认**） | 药大/中南/厦大/交大等 08:00–08:45 众数 |
| `sys_uni_50min_v1` | 高校标准·50分钟 | 矿大等 08:00–08:50 |
| `sys_uni_double_period_v1` | 大节 1-2/3-4… | 连堂课常见合并 |
| `sys_duty_2h_v1` | 值班 2 小时段 | 无课表 range 场景 |
| `sys_half_day_v1` | 上/下/晚 | 粗粒度值日 |

**公开来源（摘录）**

- [中国药科大学江宁校区上课时间](https://jwc.cpu.edu.cn/868/list.htm)  
- [中南大学相关公开信息](https://www.csu.edu.cn/info/1050/1215.htm)  
- [厦门大学公开课表时间](https://spa.xmu.edu.cn/info/1258/3412.htm)  
- [上海交大相关节次时间](https://sais.sjtu.edu.cn/yjs_tzgg/382.html)  
- [中国矿业大学作息](https://www.cumt.edu.cn/ggfw/zxsj.htm)  
- [北京大学教务课表结构](https://dean.pku.edu.cn/web/notice_details.php?id=672)  

> 实现时：启动或 migration 将种子 upsert 进 `schedule_profiles`（`scope=system`），`isDefault` 仅一条。

### 2.3 硬编码边界

| 允许 | 禁止 |
|------|------|
| `TIME_MODES` 枚举 | 页面写死 morning/午班 |
| `DEFAULT_TASK_TIME_MODE` | 页面写死 08:00 列表 |
| 种子文件 id | 业务散落 `if (mode==='section')` 不读 META |
| 兼容 legacy 映射表（一处） | 多处复制时段数组 |

---

## 3. 领域模型

### 3.1 TimeSlot

```ts
{
  id: string;
  name: string;
  start?: string;       // HH:mm
  end?: string;
  sectionIndex?: number;
  kind: 'section' | 'range' | 'hybrid';
}
```

### 3.2 ScheduleProfile

```ts
{
  id: string;
  name: string;
  scope: 'system' | 'group';
  groupId?: string;
  slots: TimeSlot[];
  version: number;
  status: 'active' | 'archived';
  isDefault?: boolean;
}
```

### 3.3 Task 时段快照

```ts
// tasks 表
time_mode: 'section' | 'range' | 'section_range'
periods: TimeSlot[]                    // 最终列，算法唯一真相
schedule_profile_id?: string
schedule_profile_version?: number
date_range_start / date_range_end
```

**mode → 展示（读 `TIME_MODE_META`，不写死 UI）**

| mode | 节次名 | 时间 | 编辑器 |
|------|:------:|:----:|--------|
| section | ✅ | 弱显/可关 | 勾选节次 |
| range | ❌ | ✅ | 增删时间段 |
| section_range | ✅ | ✅ | 节次+可改时间 |

---

## 4. 解析函数（双端同构）

```
resolvePeriods({
  mode,
  profileSlots,      // 来自 system/group profile
  selectedIds?,      // section / section_range 勾选
  customRanges?,     // range 自定义
  timeOverrides?,    // section_range 改某节时间
}) → TimeSlot[]
```

规则：

1. `section`：从 profile 取 selectedIds（默认全选），写入 start/end 快照。  
2. `range`：仅 customRanges 或 profile 中 kind=range 的模板 slots。  
3. `section_range`：profile 节次 + timeOverrides 合并。  
4. 输出至少 1 条；id 稳定；校验 start < end。  
5. **写入任务后**只认任务 `periods`，不再回查 profile。

---

## 5. 逻辑链全量复查（是否满足）

### 5.1 主链闭环检查表

| # | 链路 | 是否满足 | 说明 |
|---|------|:--------:|------|
| L1 | 登录 → 建组 → 加成员 | ✅ | 既有 groups 链不变 |
| L2 | H5/种子加载 system profiles | ✅ | 种子 + admin CRUD |
| L3 | 分组导入/自定义作息 | ✅ | `PUT /groups/{id}/schedule-profile` |
| L4 | 创建任务选 mode | ✅ | body.timeMode + resolvePeriods |
| L5 | 任务 periods 快照 | ✅ | 防作息事后改写 |
| L6 | 成员按 periodId 填报 | ✅ | availableSlots[{date,periodId}] |
| L7 | 填报 id ∈ 任务 periods | ✅ | 服务端校验 |
| L8 | 生成方案按 periodId | ✅ | schedule-engine 读任务 periods |
| L9 | 发布 assignments.periodId | ✅ | 与填报同一 id 空间 |
| L10 | 排班表列 = 任务 periods | ✅ | schedule-view 动态列 |
| L11 | mode 控制展示 | ✅ | TIME_MODE_META |
| L12 | 分享预览脱敏 | ✅ | 既有 share_token，列仍来自 periods |
| L13 | 异议/调整不丢时段定义 | ✅ | 不重算 periods，只改 assignments |
| L14 | 旧 morning/afternoon/night | ✅ | 兼容映射 → range 三段或 legacy 标记 |
| L15 | 无 AppID/tourist | ⚠️ | 配置问题，不在本域；登录链已另修 |
| L16 | H5 改模板影响历史任务 | ✅ | **不影响**（快照） |
| L17 | H5 改默认 mode | ✅ | 仅影响**新**任务 |
| L18 | 纯 section 无 profile | ✅ | 422，强制绑定/导入作息 |
| L19 | 取消/归档任务 | ✅ | 既有 status，periods 保留只读 |
| L20 | 踢人软删填报 | ✅ | 既有 is_valid，periodId 仍合法 |

### 5.2 角色 × mode 行为

| 角色 | section | range | section_range |
|------|---------|-------|---------------|
| 发布者创建 | 选作息+勾选节次 | 编辑时间段列表 | 作息+可改时间 |
| 成员填报 | 芯片显示「第N节」 | 芯片显示「HH:mm-HH:mm」 | 名+时间 |
| 发布者生成/发布 | 列=节次 | 列=时间段 | 列=名+时间 |
| 运维 H5 | 模板预览三种 mode | 同左 | 同左；任务审计只读快照 |

### 5.3 数据链（表）

```
schedule_profiles (system seeds + group overrides)
       │ import / resolve
       ▼
tasks.time_mode + tasks.periods(snapshot) + date_range_*
       │
       ├─► task_responses.available_slots [{date, periodId}]
       │
       ├─► schedule_jobs → candidate_schedules (periodId)
       │
       └─► publish → user_assignments(period_id, period_name)
                    → notify_inbox
                    → share preview columns from periods
```

### 5.4 缺口与补齐（设计已覆盖，实现分期）

| 缺口 | 补齐 |
|------|------|
| 无 schedule_profiles 表 | P1 migration + 种子 upsert |
| 前端仍内嵌 templates | P0 改为读 constants + API/本地种子缓存 |
| 无 time_mode 字段 | P0 任务表/内存模型增加 |
| H5 不存在 | P2 admin-web 模块化脚手架 |
| resolvePeriods 未抽 domain | P0 `domain/time` 双端 |

**结论：在采用本设计实现后，三条 mode 与主业务逻辑链可闭环；当前代码仅部分满足（有 periods JSON，缺 mode/profile/H5）。**

---

## 6. 模块化架构

```
shared/
  time-constants.json          # 枚举与 META
backend/
  seeds/schedule-profiles.seed.json
  domain/time/resolvePeriods.js
  handlers/admin/scheduleProfiles.js
  handlers/groups.js           # + profile
  handlers/tasks.js            # + timeMode resolve
miniprogram/
  constants/time.js            # 同步 shared
  domain/time.js
  components/period-picker/
  components/availability-grid/
  components/schedule-view/    # 已有，吃 TimeSlot
admin-web/                     # 新建
  src/layouts/AppLayout
  src/modules/
    dashboard/
    schedule-profiles/         # 系统模板 CRUD + 三 mode 预览
    groups/                    # 分组作息只读/审计
    tasks/                     # 任务快照只读
    users/
    audit/
    settings/                  # 默认 mode、默认 profile
```

---

## 7. API 增量

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/meta/time-constants` | 下发 TIME_MODE_META |
| GET/POST | `/api/v1/admin/schedule-profiles` | 系统模板 |
| PATCH/DELETE | `/api/v1/admin/schedule-profiles/{id}` | 改/归档 |
| GET/PUT | `/api/v1/groups/{id}/schedule-profile` | 分组作息 |
| POST | `/api/v1/groups/{id}/schedule-profile/import` | `{ profileId }` |
| POST | `/api/v1/groups/{id}/tasks` | `timeMode`, `selectedPeriodIds?`, `customRanges?`, `timeOverrides?` |
| GET/PUT | `/api/v1/admin/settings` | defaultTimeMode, defaultProfileId |

---

## 8. H5 模块化布局原则

1. **Shell 与业务分离**：侧栏/顶栏/权限壳不进业务 module。  
2. **Module = routes + pages + components + api**。  
3. **共用区块**：`ModeBadge`、`PeriodPreview`、`ProfileEditor`、`DataTable`。  
4. **全 mode 覆盖**：模板编辑器可切换预览；任务详情只读 `time_mode`+periods；设置改默认。  
5. **权限**：superadmin 管模板与设置；admin 只读审计+封禁（与既有矩阵一致）。

---

## 9. 兼容与迁移

1. 无 `time_mode` 的旧任务 → 默认 `section_range`。  
2. `morning|afternoon|night` → 映射为 range 三段（兼容表仅一处）。  
3. 前端内嵌 `periodTemplates` → 启动拉 `/meta` + 本地种子缓存，最终以 DB 为准。  
4. 种子 upsert：`id` 主键，重复执行幂等。

---

## 10. 分期

| 期 | 交付 |
|----|------|
| **P0** | constants + domain/time + 任务 timeMode + 小程序 period-picker 去硬编码 + 本地读种子 |
| **P1** | schedule_profiles 表 + 种子导入 + 分组作息 API |
| **P2** | admin-web 骨架 + profiles/settings/tasks 模块 |
| **P3** | meta 下发、旧数据迁移脚本、E2E 三 mode |

---

## 11. 测试

- resolvePeriods 三 mode 单测  
- 改 profile 后旧任务 periods 不变  
- 填报 periodId 不属于任务 → 422  
- 种子导入幂等  
- H5 预览三 mode 列一致  
- 小程序填报芯片文案随 META 变化  

---

## 12. 逻辑链满足性结论

| 维度 | 结论 |
|------|------|
| 三种校内模式 | 设计满足；实现 P0–P1 后可用 |
| 减少硬编码 | 常量+种子+API；页面只读 META |
| 众数种子 | 已基于公开高校作息归纳并落盘 |
| 主业务链 | 快照模型下 L1–L20 可闭环 |
| H5 运维 | 模块化布局设计覆盖全 mode；待 P2 落地 |
| 与现网 | 向后兼容 periods JSON；需加 time_mode/profile |

---

## 13. 请用户确认

请审阅本 spec 与：

- `shared/time-constants.json`  
- `backend/seeds/schedule-profiles.seed.json`  

若认可，回复 **批准**（或列出修改点）。批准后进入 **writing-plans** 写实现计划，再编码。
