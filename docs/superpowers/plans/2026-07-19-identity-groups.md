# Identity, Permissions, Groups, and Members Implementation Plan
> ⚠️ 历史文档：本文件中的 `new/` 等路径已过时，代码已提升到仓库根目录。现行结构见根 README.md。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement separate WeChat and H5 identity domains, token rotation, group ownership/admin/member permissions, invitation joins, soft-delete membership history, optional encrypted phone data, and auditable platform/group operations.

**Architecture:** The API remains the only external business write boundary. Auth adapters produce a normalized principal; guards distinguish `user` and `admin` tokens, while group policies evaluate membership for each requested group. Repositories use Kysely transactions and UUIDv7-to-BINARY(16) conversion; every membership transition emits an immutable event and audit entry.

**Tech Stack:** NestJS/Fastify, Kysely/mysql2, `jose`, `argon2`, `uuid`, Zod, Vitest, MySQL 8.4.

---

## File Map

- `services/api/src/ids/*`: UUIDv7 and binary ID conversion.
- `services/api/src/auth/*`: principals, JWT access/refresh tokens, adapters and guards.
- `services/api/src/admin-auth/*`: Argon2id admin login and session rotation.
- `services/api/src/users/*`: user profile, optional phone encryption and deletion state.
- `services/api/src/groups/*`: group repository, service, policy, controllers and DTOs.
- `services/api/src/audit/*`: immutable audit writer and query abstraction.
- `services/api/src/database/migrations/002_identity_groups.ts`: identity/group schema.
- `services/api/test/*`: auth, policy, membership transition and scenario tests.
- `tools/seed-scenario-users.mjs`: non-production U01-U13 fixture seed.

### Task 1: Add identity/group schema and ID helpers

**Files:**
- Create: `services/api/src/ids/uuid.ts`
- Create: `services/api/src/database/migrations/002_identity_groups.ts`
- Test: `services/api/test/ids.test.ts`
- Test: `services/api/test/identity-schema.integration.test.ts`

- [ ] **Step 1: Write ID conversion tests**

```ts
it('round-trips UUIDv7 strings through BINARY(16)', () => {
  const value = v7();
  expect(stringifyId(parseId(value))).toBe(value);
});
```

- [ ] **Step 2: Run tests and confirm the helper is missing**

Run: `npm test -w @scheduling/api -- ids.test.ts`

Expected: FAIL because `src/ids/uuid.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Use `uuid` v11:

```ts
import { parse, stringify, v7 } from 'uuid';

export const newId = (): string => v7();
export const parseId = (value: string): Buffer => Buffer.from(parse(value));
export const stringifyId = (value: Buffer): string => stringify(new Uint8Array(value));
```

- [ ] **Step 4: Add the migration and schema test**

`002_identity_groups.ts` creates `user_private_profiles`, `admin_sessions`, `groups`, `group_members`, `group_invite_codes`, and `group_member_events`, with UTC timestamps, status checks in application code, unique `(group_id,user_id)`, unique invite code, and indexes on active membership and event time. Every foreign key references the existing binary IDs with `ON DELETE RESTRICT`; soft-delete columns remain nullable.

The integration test migrates an empty test database, queries `information_schema.columns`, and asserts the presence of encrypted phone columns, group ownership, membership role/status, invite expiry/revocation, and event reason columns.

- [ ] **Step 5: Run migration and tests**

Run: `npm run db:migrate` then `npm test -w @scheduling/api -- ids.test.ts identity-schema.integration.test.ts`

Expected: migration success and all assertions PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/ids services/api/src/database/migrations/002_identity_groups.ts services/api/test/ids.test.ts services/api/test/identity-schema.integration.test.ts services/api/package.json new/package-lock.json
git commit -m "feat(new): add identity and group schema"
```

### Task 2: Implement principal and token services

**Files:**
- Create: `services/api/src/auth/auth.types.ts`
- Create: `services/api/src/auth/token.service.ts`
- Create: `services/api/src/auth/auth.guard.ts`
- Create: `services/api/src/auth/auth.module.ts`
- Test: `services/api/test/token.service.test.ts`
- Modify: `services/api/package.json`

- [ ] **Step 1: Write token tests**

Cover: a user access token verifies as `principal.type === 'user'`; an admin token verifies as `principal.type === 'admin'`; expired access tokens reject; refresh token hashes are not equal to their stored plaintext; a token signed for one domain is rejected by the other domain.

- [ ] **Step 2: Run the tests and confirm missing token service failure**

Run: `npm test -w @scheduling/api -- token.service.test.ts`

Expected: FAIL because `TokenService` is not implemented.

- [ ] **Step 3: Install and implement `jose` token service**

Use `jose` `SignJWT` and `jwtVerify`, with separate `aud` values `mini-user` and `admin-h5`, issuer `scheduling-api`, short access expiry, and `sha256` refresh-token hashes. Never log token values.

- [ ] **Step 4: Implement request guard**

The guard reads `Authorization: Bearer`, verifies the expected audience, assigns `request.principal`, and throws `UnauthorizedException` for missing, malformed, expired, or cross-domain tokens.

- [ ] **Step 5: Run token tests and typecheck**

Run: `npm test -w @scheduling/api -- token.service.test.ts && npm run typecheck -w @scheduling/api`

Expected: all token tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/auth services/api/test/token.service.test.ts services/api/package.json new/package-lock.json
git commit -m "feat(new): add separated principal tokens"
```

### Task 3: Add WeChat/mock user login and privacy profile

**Files:**
- Create: `services/api/src/auth/wechat-login.adapter.ts`
- Create: `services/api/src/auth/auth.controller.ts`
- Create: `services/api/src/users/user.repository.ts`
- Create: `services/api/src/users/privacy.service.ts`
- Create: `services/api/src/users/users.module.ts`
- Test: `services/api/test/wechat-login.integration.test.ts`
- Test: `services/api/test/privacy.service.test.ts`

- [ ] **Step 1: Write mock login tests**

`POST /api/v1/auth/wechat/login` with `code=mock:U04` creates one user and returns access/refresh tokens; repeating the same code returns the same user; a production-mode adapter refuses mock codes. A privacy test proves phone ciphertext is different from plaintext and the projection returns `138****1234` only for an authorized group administrator.

- [ ] **Step 2: Run tests and observe missing route/service failure**

Run: `npm test -w @scheduling/api -- wechat-login.integration.test.ts privacy.service.test.ts`

Expected: FAIL because the auth route and privacy service do not exist.

- [ ] **Step 3: Implement normalized login adapter**

Define `WechatLoginAdapter.exchange(code)` returning `{ openid, nickname, avatarUrl }`; mock mode accepts `mock:<scenario-id>` and never runs in production. Production mode calls the configured WeChat endpoint through a timeout-bound HTTP client. Upsert `users` in one transaction and issue user-domain tokens.

- [ ] **Step 4: Implement phone encryption**

Use AES-256-GCM with `PHONE_ENCRYPTION_KEY` decoded from 64 hex characters. Store ciphertext, IV, auth tag and key version in `user_private_profiles`; expose only a masked projection. Reject decryption or key-length failures without logging ciphertext.

- [ ] **Step 5: Run tests**

Run: `npm test -w @scheduling/api -- wechat-login.integration.test.ts privacy.service.test.ts`

Expected: login, idempotency, mock-mode guard and privacy tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/auth services/api/src/users services/api/test/wechat-login.integration.test.ts services/api/test/privacy.service.test.ts
git commit -m "feat(new): add WeChat user login and privacy profile"
```

### Task 4: Implement independent H5 admin auth

**Files:**
- Create: `services/api/src/admin-auth/admin-auth.service.ts`
- Create: `services/api/src/admin-auth/admin-auth.controller.ts`
- Create: `services/api/src/admin-auth/admin-auth.module.ts`
- Create: `services/api/src/admin-auth/admin-session.repository.ts`
- Create: `services/api/src/admin-auth/bootstrap-admin.ts`
- Test: `services/api/test/admin-auth.integration.test.ts`
- Modify: `services/api/package.json`

- [ ] **Step 1: Write admin auth tests**

Cover: bootstrap creates exactly one superadmin from runtime env; correct password logs in; wrong password is rejected without revealing account existence; refresh rotates and invalidates the prior refresh token; a user token cannot call admin routes; locked/disabled accounts cannot log in.

- [ ] **Step 2: Run tests and confirm missing admin auth failure**

Run: `npm test -w @scheduling/api -- admin-auth.integration.test.ts`

Expected: FAIL because `AdminAuthService` does not exist.

- [ ] **Step 3: Implement Argon2id and sessions**

Add `argon2`. Store only `argon2id` hashes and SHA-256 refresh hashes with expiry, revocation time, user agent and last-used time. Use constant generic login errors and a per-account/IP rate-limit hook. Bootstrap refuses to run in production when the password or signing secret is missing/default.

- [ ] **Step 4: Add admin guard and route boundary**

Admin controller uses audience `admin-h5`; group controllers never accept admin principals as group publishers unless an explicit read-only operation is declared. Add a policy helper returning `SUPERADMIN` or `ADMIN` capabilities.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w @scheduling/api -- admin-auth.integration.test.ts && npm run build -w @scheduling/api`

Expected: all admin auth tests PASS and build succeeds.

```bash
git add services/api/src/admin-auth services/api/test/admin-auth.integration.test.ts services/api/package.json new/package-lock.json
git commit -m "feat(new): add independent H5 admin authentication"
```

### Task 5: Implement group service and membership policies

**Files:**
- Create: `services/api/src/groups/group.repository.ts`
- Create: `services/api/src/groups/group.policy.ts`
- Create: `services/api/src/groups/group.service.ts`
- Create: `services/api/src/groups/group.controller.ts`
- Create: `services/api/src/groups/groups.module.ts`
- Create: `services/api/src/audit/audit.service.ts`
- Test: `services/api/test/group-policy.test.ts`
- Test: `services/api/test/group-membership.integration.test.ts`

- [ ] **Step 1: Write the policy matrix tests**

Use U03 publisher in G01, U04 member in G01, U12 member in G01 and publisher in G03, U01 platform superadmin with no group membership. Assert U03 can kick a G01 member; U04 cannot; U12 cannot kick in G01 but can in G03; U01 cannot read G01 member data through a group endpoint; admin principals can only read platform summaries.

- [ ] **Step 2: Run tests and confirm missing policy failure**

Run: `npm test -w @scheduling/api -- group-policy.test.ts group-membership.integration.test.ts`

Expected: FAIL because group policy/service are not implemented.

- [ ] **Step 3: Implement atomic group creation and invite join**

Create group and owner membership in one transaction. Generate a six-character uppercase invite code from an unambiguous alphabet, retry on unique collision, and store expiry/revocation separately. Join locks the membership row and handles `active`, `left`, `kicked`, and `blacklisted` exactly as the approved scenarios specify.

- [ ] **Step 4: Implement membership transitions**

Implement `leave`, `kick`, `unblock`, `setAdmin`, `removeAdmin`, `transferOwnership`, and `dissolve`. Each transition updates the membership row, inserts `group_member_events`, and writes `audit_logs` in the same transaction. Kicking invalidates response/assignment records when those tables exist; the service exposes a hook for Phase 3.

- [ ] **Step 5: Implement route-level authorization**

Every group route loads the target group and current membership before invoking service logic. Return 404 for a non-member read to avoid leaking group existence; return 403 only after membership is established and the role lacks capability. Never accept a `userId` from the request body as the acting identity.

- [ ] **Step 6: Run policy/scenario tests and commit**

Run: `npm test -w @scheduling/api -- group-policy.test.ts group-membership.integration.test.ts`

Expected: permission matrix, join/rejoin, kick/blacklist, transfer and audit assertions PASS.

```bash
git add services/api/src/groups services/api/src/audit services/api/test/group-policy.test.ts services/api/test/group-membership.integration.test.ts
git commit -m "feat(new): add group membership policies"
```

### Task 6: Seed scenario users and verify the phase

**Files:**
- Create: `tools/seed-scenario-users.mjs`
- Create: `services/api/test/scenario-identity.integration.test.ts`
- Modify: `package.json`
- Create: `docs/operations/identity-groups.md`

- [ ] **Step 1: Write scenario assertions**

Seed U01-U13 in mock mode, then assert U12 sees three active group cards with independent roles, U05 can rejoin after a non-blacklisted kick, U11 is blocked by blacklist, U09 can rejoin after leaving, and U01 cannot read G01 members through a group endpoint.

- [ ] **Step 2: Run the scenario test before the seed command exists**

Run: `npm test -w @scheduling/api -- scenario-identity.integration.test.ts`

Expected: FAIL because the fixture command and scenario service are not complete.

- [ ] **Step 3: Add an idempotent local seed**

Use only `mock:Uxx` identifiers and generated local group/invite values. The seed command must refuse when `NODE_ENV=production`, use upserts, and print counts rather than tokens or passwords.

- [ ] **Step 4: Add the operations runbook**

Document token domains, bootstrap admin command, seed restrictions, group status transitions, permission matrix, masked phone projection, and exact commands for running the scenario test with Docker services.

- [ ] **Step 5: Run the full identity phase verification**

Run:

```bash
npm run db:migrate
npm run build
npm test
npm run seed:scenarios
```

Expected: all tests pass, seed is idempotent on a second run, no token/password is printed, and `git diff --check` is clean.

- [ ] **Step 6: Commit**

```bash
git add tools/seed-scenario-users.mjs services/api/test/scenario-identity.integration.test.ts docs/operations/identity-groups.md new/package.json
git commit -m "test(new): verify identity and group scenarios"
```

## Phase Completion Check

- [ ] User and admin token audiences cannot cross boundaries.
- [ ] Production refuses mock WeChat mode and default/missing secrets.
- [ ] Phone data is encrypted and only masked projections leave the privacy service.
- [ ] Group membership transitions are transactional and auditable.
- [ ] U01-U13 identity/group scenarios pass against real MySQL.
- [ ] H5 principals cannot mutate group business records.
- [ ] `.env` is ignored and no runtime secret is present in tracked files.
