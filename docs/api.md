# API Reference

Base URL: `/api/v1`. Every response carries `x-request-id`. Errors use `{ code, message, requestId }` and the stable codes `INVALID_ARGUMENT`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `NOT_FOUND`, `VERSION_CONFLICT`, `DEPENDENCY_UNAVAILABLE`, and `INTERNAL`.

## Authentication

`POST /auth/wechat/login` accepts `{ "code": "..." }` and returns a user access token plus refresh token. User access tokens are audience-separated from H5 admin tokens. Secrets, WeChat credentials and encryption keys are loaded only from environment variables.

`POST /auth/refresh` rotates a user refresh token. The previous token is revoked immediately, so replaying it returns `UNAUTHENTICATED`. `POST /auth/logout` revokes the supplied refresh token. Admin authentication has equivalent `/admin/auth/login`, `/admin/auth/refresh`, and `/admin/auth/logout` endpoints.

The unauthenticated `GET /health/live` and `GET /health/ready` probes are served at the origin root, outside the `/api/v1` prefix. Readiness verifies MySQL and Redis and returns `503` when a required dependency is unavailable.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health/live` | Process liveness probe |
| `GET` | `/health/ready` | MySQL/Redis readiness probe |

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/wechat/login` | Exchange a WeChat code for a user access/refresh pair |
| `POST` | `/auth/refresh` | Rotate a user refresh token |
| `POST` | `/auth/logout` | Revoke a user refresh token |
| `POST` | `/admin/auth/login` | Authenticate an independent H5 administrator, optionally with TOTP |
| `POST` | `/admin/auth/refresh` | Rotate an administrator refresh token |
| `POST` | `/admin/auth/logout` | Revoke an administrator refresh token |
| `POST` | `/admin/auth/mfa/enroll` | Enroll an encrypted TOTP factor for the current administrator |
| `DELETE` | `/admin/auth/mfa` | Disable the current administrator's TOTP factor |

## Groups

All group routes require `Authorization: Bearer <user-access-token>`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/groups` | List active groups for the current user |
| `POST` | `/groups` | Create a group with `{ name }` |
| `GET` | `/groups/:groupId` | Read a group only after membership is established |
| `GET` | `/groups/:groupId/members` | List members visible to an active member |
| `POST` | `/groups/join` | Join with `{ inviteCode, displayName }` |
| `POST` | `/groups/:groupId/leave` | Leave the group |
| `POST` | `/groups/:groupId/members/:userId/kick` | Owner/admin kick; body may include `reason` and `blacklist` |
| `POST` | `/groups/:groupId/members/:userId/unblock` | Owner removes a blacklist |
| `PATCH` | `/groups/:groupId/members/:userId/admin` | Owner grants administrator role |
| `DELETE` | `/groups/:groupId/members/:userId/admin` | Owner removes administrator role |
| `POST` | `/groups/:groupId/transfer-ownership` | Owner transfers ownership with `{ targetUserId }` |
| `DELETE` | `/groups/:groupId` | Owner dissolves the group (soft delete) |

Non-members receive `NOT_FOUND` to prevent group-existence disclosure. Every membership transition writes an event and audit record in the same MySQL transaction.

## Scheduling

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/groups/:groupId/tasks` | Owner/admin creates a collecting task and immutable slots |
| `GET` | `/groups/:groupId/tasks` | Active member lists group tasks |
| `POST` | `/groups/:groupId/templates` | Create a reusable shift-period template |
| `GET` | `/groups/:groupId/templates` | List reusable templates visible to the group |
| `GET` | `/tasks/:taskId` | Task with expanded slots |
| `GET` | `/tasks/:taskId/collection` | Management-only collection progress and coverage risks |
| `POST` | `/tasks/:taskId/availability` | Submit exactly one three-state entry per slot; creates a new submission version |
| `GET` | `/tasks/:taskId/availability/me` | Read only the caller's latest availability |
| `GET` | `/tasks/:taskId/fixed-assignments` | Read fixed member requirements |
| `PATCH` | `/tasks/:taskId/fixed-assignments` | Replace fixed member requirements before publication |
| `POST` | `/tasks/:taskId/close-collection` | Owner/admin advances collection to ready |
| `POST` | `/tasks/:taskId/extend-deadline` | Owner/admin changes deadline with optimistic versioning |
| `POST` | `/tasks/:taskId/reopen` | Owner/admin reopens an eligible task |
| `POST` | `/tasks/:taskId/solve` | Queue an immutable solver snapshot; requires `Idempotency-Key` |
| `GET` | `/tasks/:taskId/solve/:jobId` | Poll solver progress |
| `GET` | `/tasks/:taskId/solve/:jobId/candidates` | Read three scored, explainable candidates |
| `POST` | `/tasks/:taskId/publish` | Validate coverage and active membership, then publish a new immutable version |
| `GET` | `/tasks/:taskId/schedule` | Read the latest published schedule for the task |
| `GET` | `/users/me/schedule` | Read the caller's assignments from latest published task versions |
| `POST` | `/tasks/:taskId/versions/:versionId/receipt` | Confirm the current version |
| `POST` | `/tasks/:taskId/versions/:versionId/objections` | Raise an objection without modifying assignments |
| `GET` | `/tasks/:taskId/versions/:versionId/objections` | Management-only objection list |
| `PATCH` | `/tasks/:taskId/versions/:versionId/objections/:objectionId` | Accept or reject an objection; acceptance enters adjustment state |

Availability defaults to unavailable. Entries and private notes are visible only to the submitting member and authorized group management endpoints. Publishing creates receipt rows and notification Outbox events atomically.

`POST /tasks/:taskId/versions/:versionId/shares` creates a short-lived, revocable share token that exposes only masked schedule data. `DELETE /shares/:shareId` revokes it, and `GET /public/shares/:token` reads the masked view without authentication.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/tasks/:taskId/versions/:versionId/shares` | Create a short-lived masked schedule share link |
| `DELETE` | `/shares/:shareId` | Revoke a share link |
| `GET` | `/public/shares/:token` | Read a masked schedule share without authentication |

Reusable templates preserve named periods for a group. A task may pass `templateId` instead of repeating `periods`. Fixed assignments are stored separately from solver snapshots and are enforced as hard constraints by the CP-SAT worker. An accepted objection moves a published task to `adjusting`; publishing a replacement version revokes every old share link and creates a fresh pending receipt set.

`GET /users/me/schedule` returns only the caller's active assignments from the latest published version of each task. It requires an active group membership and projects other members' phone numbers only as masked values; unpublished availability and private notes are never included.

`GET /tasks/:taskId/collection` is restricted to the group owner or administrator. It returns submitted/active member counts, a percentage, missing-member count and slot-level minimum-coverage risks without exposing any member's private availability state.

## H5 operations

Admin endpoints require an independently issued admin-audience token. `GET /admin/overview`, `/admin/users`, `/admin/groups`, `/admin/tasks`, `/admin/audit`, `/admin/notifications`, `/admin/solver-jobs`, `/admin/templates`, and `/admin/system` are read-only platform views. `POST /admin/notifications/:notificationId/retry` only requeues an unsent transaction-outbox record. There is deliberately no H5 endpoint for modifying group membership, availability, candidates or published schedules.

Notification delivery uses environment-only WeChat template configuration. `WX_TEMPLATE_JOIN_SUCCESS_ID` maps `schedule.collection.started` to template `mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg` (`thing1`, `thing2`, `name3`). `WX_TEMPLATE_MISSING_AVAILABILITY_ID` maps `schedule.availability.missing` to template `JQYOa6W-Fq1qZBSvJVD3vVRxfm2iQ2IaYQs-ex5DYic` (`phrase1`, `date2`, `name3`, `thing6`, `thing5`). Events without an approved mapping are marked `skipped`, not retried indefinitely. AppSecret and access-token material remain environment-only.

`PATCH /admin/users/:userId/status` supports platform-level `active`/`banned` status changes and writes an admin audit event. `POST /admin/accounts` creates an Argon2id admin account and is restricted to `superadmin`. `POST /admin/auth/mfa/enroll` returns a one-time `otpauth://` URI; the TOTP secret is AES-GCM encrypted at rest and login rejects missing or invalid codes once enabled. `DELETE /admin/auth/mfa` disables the factor.

## User privacy and lifecycle

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/users/me/phone` | Encrypt and authorize an optional phone number; returns a masked projection |
| `GET` | `/users/me/phone` | Read only the caller's masked phone projection |
| `POST` | `/users/me/deletion` | Start the idempotent 30-day deletion cooling period |
| `DELETE` | `/users/me/deletion` | Cancel a pending deletion request |

`POST /users/me/phone` accepts an optional authorized phone, encrypts it with AES-256-GCM and returns only a masked projection. `GET /users/me/phone` never returns ciphertext or a full phone number. `POST /users/me/deletion` creates an idempotent 30-day cooling-period request; `DELETE /users/me/deletion` cancels a pending request. The deadline worker anonymizes due requests by clearing WeChat/openid, avatar, encrypted phone and sessions while retaining non-identifying schedule and audit references.
