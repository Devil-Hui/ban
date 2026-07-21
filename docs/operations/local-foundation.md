# Local Foundation Runbook

## Start

1. Start Docker Desktop and wait for `docker info` to succeed.
2. Run `npm run env:init`; it creates a random, Git-ignored `.env` and refuses to overwrite an existing file.
3. Run `npm ci`.
4. Run `npm run infra:up` and `node tools/check-infrastructure.mjs`.
5. Run `npm run db:migrate`.
6. Run `npm run dev:api`.
7. In a second terminal run `npm run smoke:foundation`.

## MySQL connection diagnosis

- `docker info` failing means the Docker engine is unavailable; start Docker Desktop before changing database credentials.
- An empty `docker compose ps -q mysql` means the MySQL container is not running.
- `docker inspect --format '{{.State.Health.Status}}' <container-id>` must report `healthy`.
- Port `3307` is intentionally used by the new project to avoid collision with the legacy project on `3306`.
- The API uses `scheduling_app`; root is reserved for container initialization and emergency administration.
- Readiness returning 503 while liveness stays 200 indicates a dependency problem rather than an API process crash.

## Stop

Run `npm run infra:down`. Do not add `-v` unless local data destruction is intentional.
