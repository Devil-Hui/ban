# Smart Scheduling Platform Roadmap
> ⚠️ 历史文档：本文件中的 `new/` 等路径已过时，代码已提升到仓库根目录。现行结构见根 README.md。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement each phase plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete smart scheduling mini program, operations H5, API, OR-Tools scheduler, MySQL schema, Redis jobs, OpenAPI/Apifox contract, deployment assets, and end-to-end verification defined by the approved design.

**Architecture:** A TypeScript monorepo contains the native WeChat mini program, React operations H5, NestJS modular API, shared contracts, and design tokens. Python OR-Tools and Node notification workers run asynchronously through Redis; MySQL is the source of truth and Docker Compose provides reproducible local infrastructure.

**Tech Stack:** Node.js 22, TypeScript, npm workspaces, NestJS/Fastify, React/Vite, native WeChat Mini Program, Python 3.12, Google OR-Tools, MySQL 8.4, Redis 7, BullMQ, MinIO, Nginx, Docker Compose, Vitest, Playwright, OpenAPI 3.1.

---

## Phase 1: Platform Foundation

Detailed plan: `docs/superpowers/plans/2026-07-19-platform-foundation.md`

Produces:

- npm workspace and quality baseline;
- shared API contracts;
- MySQL, Redis and MinIO Docker services;
- NestJS/Fastify API bootstrap;
- validated configuration and secret safeguards;
- MySQL migrations and connection pool;
- Redis connection and live/ready health endpoints;
- request IDs, structured errors and foundation smoke test.

Exit evidence:

- `npm ci`, `npm run build`, and `npm test` pass;
- `docker compose up -d mysql redis minio` reaches healthy state;
- migrations apply to an empty MySQL volume;
- `/health/live` and `/health/ready` return 200;
- stopping MySQL makes readiness return 503 without crashing the API.

## Phase 2: Identity, Permissions, Groups, and Members

Plan file to be created after Phase 1 verification: `docs/superpowers/plans/2026-07-19-identity-groups.md`.

Produces:

- WeChat production/mock login adapter;
- independent admin authentication, refresh rotation, Argon2id and optional TOTP;
- users, private profiles, groups, memberships, member events and invite codes;
- owner/admin/member policy guards;
- join, leave, kick, blacklist, unblock, role assignment, ownership transfer and dissolve flows;
- encrypted optional phone storage and masked projections;
- platform user ban and immutable audit trails.

Exit evidence:

- scenario identities U01-U13 can be seeded;
- role matrix tests prove allowed and denied paths;
- cross-group IDOR tests fail closed;
- kicked, blacklisted and rejoined member scenarios match the approved specification.

## Phase 3: Tasks, Availability, Scheduling, and Publication

Plan file: `docs/superpowers/plans/2026-07-19-scheduling-domain.md`.

Produces:

- time/section/custom templates including overnight periods;
- task lifecycle, automatic deadlines and reopen/extend commands;
- three-state availability with private notes and version history;
- immutable solver snapshots and BullMQ jobs;
- OR-Tools CP-SAT hard/soft constraints and three explainable candidates;
- manual adjustment validation, versioned publication, receipts and objections;
- expiring/revocable masked share links;
- notification outbox, delivery retries and local WeChat simulator.

Exit evidence:

- feasible, infeasible, overnight, fixed-member and fairness solver tests pass;
- duplicate solve/publish requests are idempotent;
- scenario flows 5, 6 and 10 pass against real MySQL and Redis.

## Phase 4: Native WeChat Mini Program

Plan file: `docs/superpowers/plans/2026-07-19-miniprogram.md`.

Produces:

- four-tab shell: Home, Groups, Schedule, Me;
- role-aware group and task views;
- task creation wizard and time-template controls;
- availability grid with tap, drag, undo and three states;
- collection status, solver progress, candidate comparison and manual adjustment;
- publication, receipt, objection, sharing and calendar integration;
- login, privacy consent, optional phone authorization and account deletion;
- loading, empty, offline, permission-change and error states.

Exit evidence:

- WeChat DevTools compile succeeds with mock mode;
- publisher, member, visitor and cross-group navigation smoke flows pass;
- screenshots at supported phone sizes show no overlap or clipped controls;
- unavailable actions are absent rather than disabled placeholders.

## Phase 5: Operations H5

Plan file: `docs/superpowers/plans/2026-07-19-admin-web.md`.

Produces:

- independent admin login and optional TOTP challenge;
- overview, admin accounts, users/bans, read-only groups/tasks/schedules;
- audit, notifications/retry, templates, settings, queue jobs, health and backup status;
- route and component-level authorization;
- dense, restrained, responsive operations interface.

Exit evidence:

- Playwright role matrix proves superadmin/admin boundaries;
- no H5 endpoint can modify group business records;
- desktop and tablet screenshots pass visual review;
- failure/retry and empty/loading states are exercised.

## Phase 6: Contract, Data, Deployment, and Release

Plan file: `docs/superpowers/plans/2026-07-19-release-delivery.md`.

Produces:

- complete API Markdown and stable error catalog;
- Apifox-importable OpenAPI 3.1 YAML validated in CI;
- final MySQL schema SQL, migrations, ER diagram and data dictionary;
- environment/system parameter reference;
- local runbook, Linux production deployment, backup/restore and incident guide;
- Nginx, production Compose, secret requirements and migration job;
- full-stack seed, smoke tests and 13-scenario acceptance report.

Exit evidence:

- clean-machine Docker startup succeeds;
- OpenAPI validator and Apifox-compatible import checks pass;
- backup restore into a new MySQL volume reproduces checksums;
- the completion audit maps every approved requirement to current evidence.
