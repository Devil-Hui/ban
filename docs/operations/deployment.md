# Deployment and Operations

## Local

```bash
npm run env:init
npm run infra:up
npm run db:migrate
npm run build
npm test
npm run seed:scenarios
```

The local stack uses MySQL `3307`, Redis `6380`, and MinIO `9000/9001`, leaving a legacy MySQL on `3306` untouched. `docker compose config --quiet` must pass before startup.

## Linux production

1. Install Docker Engine and Compose v2 on a Linux host.
2. Inject environment variables through a secret manager or protected systemd environment file. Never put real values in Git or an image layer.
3. Run the migration job with a dedicated migration credential, then start API, H5, scheduler worker, notification worker, MySQL, Redis and Nginx.
4. Expose only Nginx over HTTPS; keep MySQL, Redis and MinIO on an internal network.
5. Configure health checks, structured log shipping, daily backups and a quarterly restore drill. Run `MYSQL_HOST=... MYSQL_PORT=... MYSQL_DATABASE=... MYSQL_USER=... MYSQL_PASSWORD=... tools/backup-mysql.sh /var/backups/scheduling`; restore to an isolated `RESTORE_DATABASE` with `tools/restore-mysql.sh` and require its manifest verification to pass.

For the registered mini program, set the WeChat extension configuration `apiBaseUrl` to the HTTPS gateway, for example `https://schedule.example.com/api/v1`. Only the DevTools `touristappid` automatically enables `mock:U03`; a real AppID always uses `wx.login` and the production WeChat exchange adapter.

Production startup rejects mock WeChat mode, missing WeChat credentials, default secrets and invalid phone-encryption keys. Worker credentials are scoped to their tables; API is the only external business write boundary.

## Incident checks

- Database unavailable: inspect `docker compose ps`, MySQL health, port ownership and `GET /health/ready`; do not switch to a second database silently.
- Queue backlog: inspect `solver_jobs` and `notification_outbox`, retry only failed jobs with the same business key.
- Failed publish: preserve the solver snapshot and schedule version; do not edit assignments directly in MySQL.
- Secret exposure: revoke the affected key, rotate through environment configuration, and record an audit event without logging the secret.
