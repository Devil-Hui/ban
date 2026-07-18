# P0 Campus Time Modes Implementation Plan

> **Status:** P0 backend + domain + seeds **DONE** (2026-07-18).  
> Miniprogram: `constants/`, `domain/`, `services/profiles.js` ready; `pages/group` create sheet wired.  
> Note: `app.json` 现为多页架构（含 `task-create` / `group-detail`），创建入口需再接到这些页。

**Goal:** section / range / section_range + 众数基础模板种子 + 任务 periods 快照 + 少硬编码。

**Architecture:** domain `resolvePeriods` + seed profiles + task snapshot; 小程序读 API/本地种子。

**Tech Stack:** Node memory repos, miniprogram JS, node:test

## Results

| Task | Status |
|------|--------|
| Domain resolvePeriods + tests | DONE — 8 tests |
| Seed load + meta/profile routes | DONE |
| Task create timeMode snapshot | DONE |
| Miniprogram constants/domain/profiles | DONE |
| Group create UI mode+profile | PARTIAL — pages/group |
| Full regression | DONE — **35 pass** |

## Key paths

- `backend/src/domain/time/index.js`
- `backend/seeds/schedule-profiles.seed.json`
- `backend/src/handlers/scheduleProfiles.js` / `tasks.js`
- `shared/time-constants.json`
- `miniprogram/constants/time.js` + seed mirror
- `miniprogram/domain/time.js` / `services/profiles.js`

## P0.5 UI chain (2026-07-18)

- `style-select` → maps 三卡片 to `timeMode` → `task-create`
- `task-create` loads seed/API profiles, mode picker, summary, `tasks.create` API
- `group-detail.goCreateTask` / `index.onCreate` pass `groupId`

## Next

1. Bind group-detail / index to live groups API (still mock cards in places)
2. MySQL schedule_profiles  
3. P2 H5 admin modules  

