# Acceptance Evidence

This document maps the approved `user-scenarios.md` flows to executable evidence. Every command reads runtime credentials from `.env` or explicit environment variables; no secret value belongs in source control.

## Scenario matrix

| Scenario | Required behavior | Authoritative evidence |
| --- | --- | --- |
| 1 | Superadmin creates an independent H5 admin account | `admin-auth.integration.test.ts` creates an Argon2id `admin` through `/admin/accounts`; ordinary admin creation is blocked by the controller role guard |
| 2 | Admin overview, audit and read-only business views | `admin-operations` API plus H5 production build; controller exposes no group-business mutation route |
| 3 | Publisher creates a group and invite code | `group-membership.integration.test.ts` and `scenario-identity.integration.test.ts` |
| 4 | Member joins via invite code with isolated role | `group-membership.integration.test.ts` |
| 5 | Publisher creates a task; members submit private three-state availability | `scheduling-domain.integration.test.ts` verifies slot expansion, versioning and submitter-only reads |
| 6 | Real CP-SAT generation, fixed member, candidate publication and masked contact | `test_solver.py`, `scheduling-domain.integration.test.ts`, `/tasks/:taskId/schedule` projection |
| 7 | Kick, retained history and allowed non-blacklisted rejoin | `scenario-identity.integration.test.ts` |
| 8 | Blacklisted rejoin is denied until owner unblock | `group-membership.integration.test.ts` and group policy tests |
| 9 | Voluntary leave and rejoin | `scenario-identity.integration.test.ts` |
| 10 | Objection acceptance, adjustment, versioned republish and old-share revocation | `scheduling-domain.integration.test.ts` end-to-end objection loop |
| 11 | Cross-group roles remain independent | `scenario-identity.integration.test.ts` |
| 12 | Visitor empty state can become a member | U10 fixture in `seed-scenario-users.mjs`, group join tests and mini-program empty-state UI |
| 13 | H5 system governance cannot bypass group membership | admin/user audience separation, group IDOR checks and absence of H5 group-business mutation endpoints |

## Automated baseline

Run from `new/`:

```bash
npm run build
npm test
npm run test:scheduler
npm run test:lifecycle-worker
npm run smoke:scheduling
npm run build -w @scheduling/admin-web
npm run openapi:lint
npm run db:migrate
docker compose config --quiet
docker compose -f docker-compose.production.yml config --quiet
```

The local integration suite uses real MySQL 8.4 and Redis. `test:lifecycle-worker` creates a due deletion request, runs the worker once, and verifies identity/private fields are cleared and sessions revoked. `test:scheduler` uses real Google OR-Tools CP-SAT for feasible, infeasible, fixed-member and overnight cases.

The native mini program must also pass:

```powershell
& 'D:\weichat小程序\微信web开发者工具\cli.bat' build-npm --project '<worktree>\new\apps\miniprogram'
```

Source compilation and TDesign npm packaging work with `touristappid`. Preview upload requires a registered real AppID and is an external WeChat permission gate, not a source build gate.

The current verified preview command reaches the upload stage and is rejected only because `touristappid` is not a valid registered AppID (`invalid appid`). Replace `appid` through the ignored `project.private.config.json` or DevTools project settings when the real registration is available; never commit that file.

## Backup drill

On Linux, run `tools/backup-mysql.sh`, create an isolated empty database, and run `tools/restore-mysql.sh`. The restore is accepted only when archive SHA-256 checks and immutable table manifests match. In-place restore is refused unless explicitly enabled.

## Visual gate

Check Home, Groups, task creation, availability, candidates, result/receipt/objection, and Me pages in WeChat DevTools at common phone widths. Permission-only controls must be absent for members. H5 desktop/tablet screenshots require the local browser runtime or a CI Playwright runner; build and API checks do not substitute for this visual review.
