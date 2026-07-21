# Login + Group Naming + 5-Step Task Create Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pure WeChat login, auto-suffixed group names, and a five-step task create wizard (campus period presets, schedule preview/select, people paint brush, collection rules) with matching API/DB support.

**Architecture:** Keep domain logic in pure JS modules under `apps/miniprogram/domain/` (node:testable). UI pages only orchestrate step state. Reusable `schedule-grid` component renders readonly/select/paint modes. Backend extends `POST /groups/:id/tasks` with `timeMode`, `selectedSlots`, and `rules`; only selected cells become `task_slots`. Deadline worker reads per-task `remindBeforeMinutes` instead of hard-coded 30.

**Tech Stack:** WeChat miniprogram + TDesign miniprogram; NestJS/Fastify API; Kysely/MySQL; Redis outbox already present; node:test for mini domain; vitest for API.

**Spec:** `docs/superpowers/specs/2026-07-20-task-create-wizard-design.md`

## Global Constraints

- Work only under worktree `feature/new-platform-foundation` → `new/`.
- No identity-switch UI on login in any env; mock login may use default `U03` only.
- Secondary period shortcuts: `08:00·45′` / `08:30·45′` / manual; never claim “national mode”.
- Step4 default: no cells selected; ≥1 required to continue.
- People paint: max N → tools 1..N + erase; unpainted selected cells submit as `maxPeople=1`.
- Rules (required fields, participant scope, reserved list, edit policy, remind, save template) are **task-level**; only people count is per-slot.
- `share_link` = group active members **or** logged-in visitor with valid share token.
- TDD: failing test → implement → pass → commit per task.
- Frequent small commits; do not mix unrelated refactors.

## File Map

| Path | Responsibility |
|------|----------------|
| `apps/miniprogram/domain/group-name.js` | Unique display name suffix |
| `apps/miniprogram/domain/date-defaults.js` | Today / deadline defaults |
| `apps/miniprogram/domain/period-builder.js` | Preset + tweaks → periods |
| `apps/miniprogram/domain/name-parser.js` | Reserved-list tokenization |
| `apps/miniprogram/domain/slot-selection.js` | Slot keys, paint apply |
| `apps/miniprogram/constants/time-modes.js` | TIME_MODES + META |
| `apps/miniprogram/constants/schedule-profiles.seed.json` | Copied campus seeds |
| `apps/miniprogram/constants/error-codes.js` | Code → Chinese message |
| `apps/miniprogram/styles/design-tokens.wxss` | Global font/color tokens |
| `apps/miniprogram/components/schedule-grid/*` | Grid UI |
| `apps/miniprogram/pages/login/*` | Pure WeChat login |
| `apps/miniprogram/pages/groups/groups.js` | Create with suffix |
| `apps/miniprogram/pages/task-create/*` | 5-step wizard |
| `apps/miniprogram/pages/me/me.js` | Logout → login |
| `services/api` migrations + schedule service/repo | Task rules + selected slots |
| `services/api` group service | Owner-scoped name suffix |
| `services/deadline-worker/worker.mjs` | Per-task remind window |

---

### Task 1: Domain — group name suffix

**Files:**
- Create: `apps/miniprogram/domain/group-name.js`
- Create: `apps/miniprogram/test/group-name.test.js`

**Interfaces:**
- Produces: `uniqueGroupName(rawName: string, existingNames: string[]): string`

- [ ] **Step 1: Write failing test**

```js
// test/group-name.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const { uniqueGroupName } = require('../domain/group-name');

test('returns trimmed name when free', () => {
  assert.equal(uniqueGroupName('  实验组  ', ['其它']), '实验组');
});

test('appends (2) then (3) on collision', () => {
  assert.equal(uniqueGroupName('实验组', ['实验组']), '实验组(2)');
  assert.equal(uniqueGroupName('实验组', ['实验组', '实验组(2)']), '实验组(3)');
});

test('empty after trim throws or returns empty for caller to reject', () => {
  assert.equal(uniqueGroupName('   ', []), '');
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/miniprogram && node --test test/group-name.test.js
```

Expected: cannot find module `../domain/group-name`

- [ ] **Step 3: Implement**

```js
// domain/group-name.js
function uniqueGroupName(rawName, existingNames) {
  const base = String(rawName || '').trim();
  if (!base) return '';
  const set = new Set((existingNames || []).map((n) => String(n)));
  if (!set.has(base)) return base;
  let k = 2;
  while (set.has(`${base}(${k})`)) k += 1;
  return `${base}(${k})`;
}
module.exports = { uniqueGroupName };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test test/group-name.test.js
```

- [ ] **Step 5: Commit**

```bash
git add apps/miniprogram/domain/group-name.js apps/miniprogram/test/group-name.test.js
git commit -m "feat(miniprogram): add unique group name suffix helper"
```

---

### Task 2: Domain — date defaults + name parser + slot keys

**Files:**
- Create: `apps/miniprogram/domain/date-defaults.js`
- Create: `apps/miniprogram/domain/name-parser.js`
- Create: `apps/miniprogram/domain/slot-selection.js`
- Create: `apps/miniprogram/test/date-name-slot.test.js`

**Interfaces:**
- Produces:
  - `todayYmd(now?: Date): string`
  - `defaultDeadlineIso(now?: Date): string` // local calendar day 23:59 with offset
  - `parseReservedNames(text: string): string[]`
  - `slotKey(date: string, periodCode: string): string`
  - `parseSlotKey(key: string): { date: string, periodCode: string }`
  - `applyPaint(peopleByKey: object, key: string, tool: number|'erase'|null): object`

- [ ] **Step 1: Write failing tests** covering free name parse (`"甲,乙、丙 丁"` → 4 names), key round-trip, paint erase clears key, paint 2 sets number.

- [ ] **Step 2: Run — FAIL**

```bash
node --test test/date-name-slot.test.js
```

- [ ] **Step 3: Implement pure functions** (no `wx`)

```js
// name-parser.js sketch
function parseReservedNames(text) {
  return String(text || '')
    .split(/[\s,，、;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((name, i, arr) => arr.indexOf(name) === i);
}
```

```js
// slot-selection.js sketch
function slotKey(date, periodCode) { return `${date}|${periodCode}`; }
function applyPaint(peopleByKey, key, tool) {
  const next = { ...(peopleByKey || {}) };
  if (tool === 'erase' || tool == null) { delete next[key]; return next; }
  if (Number.isInteger(tool) && tool >= 1) next[key] = tool;
  return next;
}
```

For `defaultDeadlineIso`, build `YYYY-MM-DDT23:59:00.000+08:00` using local Y/M/D of `now` (document Asia/Shanghai assumption for campus app; match existing task-create pattern).

- [ ] **Step 4: PASS + commit**

```bash
git commit -m "feat(miniprogram): add date defaults, name parser, slot paint helpers"
```

---

### Task 3: Domain — period builder from presets

**Files:**
- Create: `apps/miniprogram/constants/schedule-profiles.seed.json` (campus seed; lives under new/ only)
- Create: `apps/miniprogram/constants/time-modes.js`
- Create: `apps/miniprogram/domain/period-builder.js`
- Create: `apps/miniprogram/test/period-builder.test.js`

**Interfaces:**
- Produces:
  - `TIME_MODES = { RANGE:'range', SECTION:'section', SECTION_RANGE:'section_range' }`
  - `resolveTimeMode(selected: {range?:boolean, section?:boolean, custom?:boolean}): string`
  - `buildPeriods({ preset: 'start0800_45'|'start0830_45'|'manual', tweaks: { firstStart?:'HH:mm', durationMin?:number, morningCount?:number, afternoonCount?:number, eveningCount?:number, breakMin?:number } }): Array<Period>`
  - Period: `{ code, label, startMinute, endMinute, minPeople:1, targetPeople:1, maxPeople:1 }`

- [ ] **Step 1: Failing tests**
  - `resolveTimeMode({range:true, section:true}) === 'section_range'`
  - `buildPeriods({preset:'start0800_45'})` first period `startMinute===480`, duration 45
  - `buildPeriods({preset:'start0830_45'})` first `startMinute===510`
  - Manual tweak overrides first start after choosing 0800 preset

- [ ] **Step 2: Implement** by generating N periods from first start + duration + break (default break 10; after period 2 optional long break 20 for morning — keep simple: fixed 10 min break unless tweak says otherwise). Labels: `第${i}节` and/or time range based on mode at display layer; store both code `p${i}` and label with section index + time for section_range.

- [ ] **Step 3: PASS + commit**

```bash
git commit -m "feat(miniprogram): period builder with 08:00/08:30 presets"
```

---

### Task 4: Pure WeChat login + logout target

**Files:**
- Modify: `apps/miniprogram/pages/login/login.wxml`
- Modify: `apps/miniprogram/pages/login/login.js`
- Modify: `apps/miniprogram/pages/me/me.js`
- Test: extend `apps/miniprogram/test/api.test.js` only if login helpers change; otherwise manual checklist in commit message

- [ ] **Step 1: Remove profile list from WXML** — keep brand + single `微信登录` button; delete `wx:if authMode==='mock'` profile section.

- [ ] **Step 2: login.js `submit`** always:
  - mock: `api.login({ interactive: true, mockUserId: 'U03' })`
  - production: `api.login({ interactive: true })`
  - button label always `微信登录`

- [ ] **Step 3: me.js logout** → `wx.reLaunch({ url: '/pages/login/login' })` (api.logout already redirects; align both).

- [ ] **Step 4: Hand-check** cold start shows no 小明/小红; commit

```bash
git commit -m "fix(miniprogram): pure WeChat login without mock identity picker"
```

---

### Task 5: Group create suffix (frontend + backend)

**Files:**
- Modify: `apps/miniprogram/pages/groups/groups.js`
- Modify: `services/api/src/groups/group.service.ts`
- Modify: `services/api/src/groups/group.repository.ts` (add list names for owner if needed)
- Test: `services/api/test/group-membership.integration.test.ts` (or new `group-name.integration.test.ts`)

**Interfaces:**
- Backend `create(ownerId, name, requestId)` returns group with final unique name among owner's active groups.

- [ ] **Step 1: API failing test** — create two groups same name for same user; second name ends with `(2)`.

- [ ] **Step 2: Implement backend** — after normalize, `listMine(ownerId)` names → same algorithm as `uniqueGroupName` (port to TS in service private method).

- [ ] **Step 3: Frontend `onCreate`** — before POST, compute `uniqueGroupName(name, groups.map(g=>g.name))`; toast final name on success.

- [ ] **Step 4: Run API test + mini not required; commit

```bash
git commit -m "feat: auto-suffix duplicate group names per owner"
```

---

### Task 6: Design tokens + time-mode constants in app

**Files:**
- Create: `apps/miniprogram/styles/design-tokens.wxss`
- Modify: `apps/miniprogram/app.wxss` — `@import './styles/design-tokens.wxss';`
- Create: `apps/miniprogram/constants/error-codes.js`

- [ ] **Step 1: Add CSS variables** from spec §7.1 (`--color-brand: #1e9e5a`, font sizes, etc.)

- [ ] **Step 2: error-codes map** `TASK_SLOT_REQUIRED` → `请先选定可排班时段` etc.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(miniprogram): global design tokens and error code map"
```

---

### Task 7: `schedule-grid` component

**Files:**
- Create: `apps/miniprogram/components/schedule-grid/schedule-grid.js|wxml|wxss|json`
- Create: `apps/miniprogram/test/schedule-grid-logic.test.js` for pure helpers if extracted; UI via devtools later

**Interfaces:**
- Properties: `periods`, `dates`, `timeMode`, `mode` (`readonly`|`select`|`paint`), `selectedKeys` (array), `peopleByKey` (object), `activeTool`
- Events: `selectchange` detail `{ keys }`, `paint` detail `{ key, peopleByKey }`

- [ ] **Step 1: Implement grid WXML** — header row dates; body rows periods; cell class by selected/disabled.

- [ ] **Step 2: select mode** — tap toggles key in local copy, trigger `selectchange`.

- [ ] **Step 3: paint mode** — only keys in `selectedKeys` accept tap; apply tool via `applyPaint`.

- [ ] **Step 4: readonly** — no handlers.

- [ ] **Step 5: Minimal drag** — `bindtouchstart/move/end` on row to select contiguous cells (document if rectangular deferred).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(miniprogram): schedule-grid component for preview select paint"
```

---

### Task 8: Backend — migration for rules + time_mode + reserved names

**Files:**
- Create: `services/api/src/database/migrations/009_task_collection_rules.ts`
- Modify: schema docs if present
- Test: migration up in integration harness

- [ ] **Step 1: Migration**

```ts
// add to schedule_tasks:
// time_mode varchar(32) null
// rules_json json null
// create table task_reserved_names (
//   id binary(16) PK, task_id binary(16), name varchar(80), sort_order int,
//   FK task_id cascade
// )
```

- [ ] **Step 2: Run migrate in dev**

```bash
 npm run db:migrate
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): migration for task time_mode rules and reserved names"
```

---

### Task 9: Backend — extend createTask for selectedSlots + rules

**Files:**
- Modify: `services/api/src/scheduling/schedule.service.ts`
- Modify: `services/api/src/scheduling/schedule.repository.ts`
- Modify: `services/api/src/scheduling/schedule.controller.ts` (body passthrough)
- Test: `services/api/test/scheduling-domain.integration.test.ts`

**Interfaces:**
- `createTask(actorId, groupId, input, requestId)` input adds:
  - `timeMode?: string`
  - `selectedSlots?: { date: string; periodCode: string; maxPeople?: number }[]`
  - `rules?: { requiredFields, participantScope, reservedNames?, allowEditAfterSubmit, maxEditCount, remindBeforeMinutes, saveAsTemplate?, templateName? }`

- [ ] **Step 1: Failing integration test**
  - Create task with 2 periods × 1 day but `selectedSlots` only 1 cell → `listSlots` length 1
  - `maxPeople` on that slot = 2 when painted
  - `rules.participantScope='reserved_list'` without names → BadRequest
  - `remindBeforeMinutes: 60` stored and readable on getTask (extend getTask DTO)

- [ ] **Step 2: Repository** — when `selectedSlots` provided, only insert those slots; map periodCode → period id; default maxPeople 1.

- [ ] **Step 3: Service validation** per spec §6.2; save reserved names; optional `saveAsTemplate`.

- [ ] **Step 4: Backward compat** — if `selectedSlots` omitted, keep old expand-all behavior for existing smoke tests **or** update smoke tests to pass selectedSlots. Prefer updating callers so production path always sends selectedSlots from mini.

- [ ] **Step 5: PASS + commit**

```bash
git commit -m "feat(api): create task with selected slots and collection rules"
```

---

### Task 10: Deadline worker uses per-task remindBeforeMinutes

**Files:**
- Modify: `services/deadline-worker/worker.mjs`
- Test: small unit script or document SQL assertion in `tools/test-lifecycle-worker.mjs` if exists

- [ ] **Step 1: Change query** from fixed `interval 30 minute` to compare `deadline - interval remind minutes` using `JSON_EXTRACT(rules_json,'$.remindBeforeMinutes')` with fallback 30 when JSON null and skip when JSON null and explicit null — implement:

```sql
-- remind if rules_json is null → 30 (legacy)
-- if JSON remindBeforeMinutes is null → skip reminder for that task
-- else use that integer
```

Logic in JS after selecting collecting tasks with deadline in future may be clearer than pure SQL.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(deadline-worker): honor per-task remindBeforeMinutes"
```

---

### Task 11: Task-create Step1–2 UI (info + period setup)

**Files:**
- Rewrite: `apps/miniprogram/pages/task-create/task-create.js|wxml|wxss|json`
- Register `schedule-grid` in page json when needed (step3+)

- [ ] **Step 1: Data model**

```js
data: {
  step: 1,
  groupId: '',
  title: '',
  dateStart: '', dateEnd: '', deadline: '',
  modeFlags: { range: false, section: false, custom: false },
  timeMode: 'section_range',
  preset: 'start0800_45', // or start0830_45 | manual
  tweaks: { firstStart: '08:00', durationMin: 45, morningCount: 4, afternoonCount: 4, eveningCount: 0, breakMin: 10 },
  periods: [],
  // later steps fields empty
}
```

- [ ] **Step 2: onLoad** set defaults via `todayYmd` + `defaultDeadlineIso`; load groupId.

- [ ] **Step 3: Step1 WXML** — placeholder `请输入任务名称`; date pickers; next validates title.

- [ ] **Step 4: Step2 WXML** — primary chips for 时间段/节次/自定义; secondary 08:00/08:30/手动; tweak form always visible after preset; button「生成课表骨架」calls `buildPeriods`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(miniprogram): task-create steps 1-2 defaults and period setup"
```

---

### Task 12: Task-create Step3–4 (preview + selection)

**Files:**
- Modify: `apps/miniprogram/pages/task-create/*`
- Use: `schedule-grid`

- [ ] **Step 1: Step3** readonly grid; back clears nothing; next → step4 with `selectedKeys: []`.

- [ ] **Step 2: Step4** select mode; `onSelectChange` updates keys; next requires `selectedKeys.length >= 1`.

- [ ] **Step 3: If user returns to step2 and regenerates periods, clear `selectedKeys` and `peopleByKey`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(miniprogram): task-create preview and slot selection steps"
```

---

### Task 13: Task-create Step5 rules + paint + submit

**Files:**
- Modify: `apps/miniprogram/pages/task-create/*`
- Optional: `apps/miniprogram/services/notify.js` port subscribe for deadline (or inline wx.requestSubscribeMessage on submit click)

- [ ] **Step 1: Task-level form** — requiredFields checkboxes; participantScope radio; reserved list textarea + parse table; deadline override; allowEdit + maxEditCount; remindBeforeMinutes picker (15/30/60/120/关闭); saveAsTemplate.

- [ ] **Step 2: Paint bar** — input maxCapacity N; tools 1..N + 擦除; grid mode=paint.

- [ ] **Step 3: submit payload**

```js
{
  title, dateStart, dateEnd, deadline,
  timeMode, periods,
  selectedSlots: selectedKeys.map((key) => {
    const { date, periodCode } = parseSlotKey(key);
    return { date, periodCode, maxPeople: peopleByKey[key] || 1 };
  }),
  rules: { ... }
}
```

- [ ] **Step 4: On success** `redirectTo` task-detail manage=1; on fail toast `error-codes` / api.errorMessage.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(miniprogram): task-create rules paint and submit"
```

---

### Task 14: Availability submit respects participantScope (minimal)

**Files:**
- Modify: `services/api/src/scheduling/schedule.service.ts` `submitAvailability`
- Test: integration case for share_link token if share API exists (`share.controller.ts`)

- [ ] **Step 1:** When rules.participantScope is `all_members`, require group membership (current behavior via requireTask view).

- [ ] **Step 2:** When `share_link`, allow if member **or** valid share token header/query (define `X-Share-Token` or body token — match existing share controller patterns).

- [ ] **Step 3:** Commit

```bash
git commit -m "feat(api): enforce participantScope on availability submit"
```

---

### Task 15: End-to-end smoke + hand checklist

**Files:**
- Modify if needed: `tools/smoke-scheduling-flow.mjs`
- Run miniprogram tests + api tests

- [ ] **Step 1:**

```bash
cd apps/miniprogram && npm test
 npm run test -w @scheduling/api
```

- [ ] **Step 2: Manual checklist** from spec §9.3 (login, group suffix, defaults, 5 steps, paint, create).

- [ ] **Step 3: Commit smoke fixes if any**

```bash
git commit -m "test: align smoke and coverage for task create wizard"
```

---

## Self-Review (plan vs spec)

| Spec item | Task |
|-----------|------|
| G1 pure login | T4 |
| G2 group suffix | T1, T5 |
| G3 date/title defaults | T2, T11 |
| G4 five steps | T11–T13 |
| G5 schedule grid | T7, T12–T13 |
| G6 API selected slots + rules | T8–T9 |
| G7 tokens + domain split | T1–T3, T6 |
| 08:00/08:30/manual | T3 |
| People paint | T2, T7, T13 |
| remindBeforeMinutes + subscribe | T9–T10, T13 |
| share_link scope | T9, T14 |
| reserved list parse | T2, T13 |
| No xlsx | T13 notes only |

No TBD placeholders left in tasks. Types: `Period`, `selectedSlots`, `rules` consistent across T3/T9/T13.

---

## Execution Handoff

Plan complete and saved to:

`docs/superpowers/plans/2026-07-20-task-create-wizard.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans and checkpoints  

Which approach?
