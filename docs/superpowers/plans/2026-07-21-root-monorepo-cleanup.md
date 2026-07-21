# Root Monorepo Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote the latest scheduling platform from the feature worktree into one clean root-level monorepo.

**Architecture:** Keep one source tree at the repository root with `apps`, `services`, `packages`, `infra`, and `tools`. Development and production share source code and switch through environment templates, WeChat `envVersion`/`extConfig`, and separate Compose files.

**Tech Stack:** WeChat Mini Program, TDesign, NestJS/Fastify, TypeScript, MySQL, Redis, Docker Compose, npm workspaces.

---

### Task 1: Preserve the latest source

- [ ] Verify `feature/new-platform-foundation` is clean and newer than `master`.
- [ ] Copy the worktree `new/` contents to a temporary staging directory, excluding `node_modules` and generated build output.
- [ ] Preserve the root ChatGPT PNG and local environment files.

### Task 2: Replace the partial root migration

- [ ] Remove the root junction and obsolete source directories.
- [ ] Promote `apps`, `services`, `packages`, `infra`, `tools`, and root workspace configuration from staging.
- [ ] Merge current documentation into `docs` and remove legacy/duplicate documentation.
- [ ] Move project-owned root Markdown files into `docs`.

### Task 3: Remove duplicate work areas

- [ ] Remove `new`, `.workbuddy`, `.worktrees`, `.codebuddy`, and obsolete assistant-local residue.
- [ ] Prune Git worktree metadata while retaining commit history.
- [ ] Ensure no source path references `.worktrees`, `.workbuddy`, or `new/`.

### Task 4: Normalize environments and assets

- [ ] Keep `.env.example` for development and `.env.production.example` for deployment.
- [ ] Keep `docker-compose.yml` and `docker-compose.production.yml` as environment entry points.
- [ ] Verify the mini program uses local icon/font assets and has no remote icon URL dependency.
- [ ] Update documentation and scripts to use root-relative paths only.

### Task 5: Verify the clean repository

- [ ] Run workspace validation, build, tests, and mini-program tests.
- [ ] Scan for duplicate project files, forbidden directories, remote icon assets, and misplaced Markdown.
- [ ] Confirm the WeChat project root is `apps/miniprogram` and runtime configuration distinguishes develop from trial/release.
