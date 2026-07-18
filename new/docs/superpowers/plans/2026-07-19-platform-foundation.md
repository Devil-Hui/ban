# Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reproducible monorepo, local infrastructure, shared contracts, NestJS API, MySQL migrations, Redis connectivity, health endpoints, structured errors, and an executable foundation smoke test.

**Architecture:** npm workspaces hold focused TypeScript packages and services. Docker Compose provides MySQL 8.4, Redis 7 and MinIO; the API uses validated environment configuration, Kysely/mysql2 for database access, ioredis for Redis, and Fastify through NestJS.

**Tech Stack:** Node.js 22, npm 10, TypeScript 5, NestJS 11, Fastify 5, Zod 4, Kysely, mysql2, ioredis, Vitest, Docker Compose.

---

## File Map

- `package.json`: workspace scripts and supported runtime.
- `tsconfig.base.json`: strict shared TypeScript settings.
- `.editorconfig`, `.gitignore`: repository hygiene.
- `tools/verify-workspace.mjs`: deterministic workspace structure check.
- `.env.example`: non-secret local configuration contract.
- `tools/init-local-env.mjs`: generates untracked local runtime secrets.
- `docker-compose.yml`: MySQL, Redis and MinIO local services.
- `packages/contracts/*`: shared error and pagination contracts.
- `services/api/src/config/*`: validated environment configuration.
- `services/api/src/database/*`: Kysely pool and migrations.
- `services/api/src/redis/*`: Redis connection lifecycle.
- `services/api/src/health/*`: liveness and dependency readiness.
- `services/api/src/http/*`: request ID and stable error envelope.
- `services/api/src/main.ts`: Fastify/NestJS process entry.
- `tools/smoke-foundation.mjs`: black-box health and failure-mode check.
- `docs/operations/local-foundation.md`: exact local startup and MySQL diagnostics.

### Task 1: Create the workspace baseline

**Files:**
- Create: `tools/verify-workspace.mjs`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `apps/.gitkeep`
- Create: `services/.gitkeep`
- Create: `packages/.gitkeep`

- [ ] **Step 1: Write the failing workspace verifier**

Create `tools/verify-workspace.mjs`:

```js
import { access, readFile } from 'node:fs/promises';

const required = [
  'package.json',
  'tsconfig.base.json',
  '.editorconfig',
  'apps',
  'services',
  'packages',
];

for (const path of required) await access(path);

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const expected = ['apps/*', 'services/*', 'packages/*'];
if (JSON.stringify(pkg.workspaces) !== JSON.stringify(expected)) {
  throw new Error(`workspaces must equal ${JSON.stringify(expected)}`);
}
if (pkg.private !== true) throw new Error('root package must be private');
console.log('workspace-baseline=ok');
```

- [ ] **Step 2: Run the verifier and confirm it fails**

Run: `node tools/verify-workspace.mjs`

Expected: FAIL with `ENOENT` for `package.json` or `tsconfig.base.json`.

- [ ] **Step 3: Create the root workspace files**

Create `package.json`:

```json
{
  "name": "smart-scheduling-platform",
  "version": "0.1.0",
  "private": true,
  "packageManager": "npm@10.9.2",
  "workspaces": ["apps/*", "services/*", "packages/*"],
  "engines": { "node": ">=22 <23", "npm": ">=10 <11" },
  "scripts": {
    "check:workspace": "node tools/verify-workspace.mjs",
    "env:init": "node tools/init-local-env.mjs",
    "build": "npm run build -w @scheduling/contracts && npm run build -w @scheduling/api",
    "test": "npm run test -w @scheduling/contracts && npm run test -w @scheduling/api",
    "typecheck": "npm run build -w @scheduling/contracts && npm run typecheck -w @scheduling/contracts && npm run typecheck -w @scheduling/api",
    "infra:up": "docker compose up -d mysql redis minio",
    "infra:down": "docker compose down",
    "infra:ps": "docker compose ps",
    "db:migrate": "npm run db:migrate -w @scheduling/api",
    "dev:api": "npm run dev -w @scheduling/api"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.py]
indent_size = 4
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
.DS_Store
Thumbs.db
*.log
.pytest_cache/
__pycache__/
*.pyc
.venv/
miniprogram_npm/
```

Create the three `.gitkeep` files as empty files.

- [ ] **Step 4: Verify the workspace baseline**

Run: `node tools/verify-workspace.mjs`

Expected: `workspace-baseline=ok`.

- [ ] **Step 5: Commit the baseline**

```bash
git add new/package.json new/tsconfig.base.json new/.editorconfig new/.gitignore new/tools/verify-workspace.mjs new/apps/.gitkeep new/services/.gitkeep new/packages/.gitkeep
git commit -m "chore(new): establish workspace baseline"
```

### Task 2: Add shared API contracts

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/api-error.ts`
- Create: `packages/contracts/src/pagination.ts`
- Test: `packages/contracts/test/contracts.test.ts`

- [ ] **Step 1: Write the failing contract test**

Create `packages/contracts/test/contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, createPageResult } from '../src/index.js';

describe('shared contracts', () => {
  it('exposes stable API error codes', () => {
    expect(API_ERROR_CODES.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    expect(API_ERROR_CODES.VERSION_CONFLICT).toBe('VERSION_CONFLICT');
  });

  it('omits nextPageToken when there is no next page', () => {
    expect(createPageResult([{ id: '1' }])).toEqual({ items: [{ id: '1' }] });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -w @scheduling/contracts`

Expected: FAIL because the workspace package or exports do not exist.

- [ ] **Step 3: Implement the contracts package**

Create `packages/contracts/package.json`:

```json
{
  "name": "@scheduling/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./dist/index.js" },
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Create `packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*.ts"]
}
```

Create `packages/contracts/src/api-error.ts`:

```ts
export const API_ERROR_CODES = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiFieldViolation {
  field: string;
  description: string;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    fieldViolations?: ApiFieldViolation[];
  };
}
```

Create `packages/contracts/src/pagination.ts`:

```ts
export interface PageResult<T> {
  items: T[];
  nextPageToken?: string;
}

export function createPageResult<T>(items: T[], nextPageToken?: string): PageResult<T> {
  return nextPageToken ? { items, nextPageToken } : { items };
}
```

Create `packages/contracts/src/index.ts`:

```ts
export * from './api-error.js';
export * from './pagination.js';
```

- [ ] **Step 4: Install and verify the package**

Run: `npm install`

Expected: workspace lockfile created without dependency errors.

Run: `npm test -w @scheduling/contracts && npm run build -w @scheduling/contracts`

Expected: 2 tests PASS and TypeScript build exits 0.

- [ ] **Step 5: Commit shared contracts**

```bash
git add new/package-lock.json new/packages/contracts
git commit -m "feat(new): add shared API contracts"
```

### Task 3: Define reproducible local infrastructure

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `infra/mysql/conf.d/charset.cnf`
- Create: `tools/init-local-env.mjs`
- Create: `tools/check-infrastructure.mjs`

- [ ] **Step 1: Write the infrastructure verifier**

Create `tools/check-infrastructure.mjs`:

```js
import { execFileSync } from 'node:child_process';

const services = ['mysql', 'redis', 'minio'];
for (const service of services) {
  const id = execFileSync('docker', ['compose', 'ps', '-q', service], { encoding: 'utf8' }).trim();
  if (!id) throw new Error(`${service} container is not running`);
  const health = execFileSync('docker', ['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}', id], { encoding: 'utf8' }).trim();
  if (!['healthy', 'running'].includes(health)) throw new Error(`${service} health=${health}`);
}
console.log('infrastructure=healthy');
```

- [ ] **Step 2: Confirm the verifier fails before Compose exists**

Run: `node tools/check-infrastructure.mjs`

Expected: FAIL because Compose services are not defined in `new`.

- [ ] **Step 3: Add environment and Compose definitions**

Create `.env.example`:

```dotenv
NODE_ENV=development
API_PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_DATABASE=scheduling
MYSQL_USER=scheduling_app
MYSQL_PASSWORD=
MYSQL_ROOT_PASSWORD=
REDIS_HOST=127.0.0.1
REDIS_PORT=6380
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=scheduling-local
WECHAT_MODE=mock
ADMIN_BOOTSTRAP_USERNAME=superadmin
ADMIN_BOOTSTRAP_PASSWORD=
TOKEN_SIGNING_SECRET=
PHONE_ENCRYPTION_KEY=
```

Create `tools/init-local-env.mjs`:

```js
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../.env', import.meta.url);
const template = new URL('../.env.example', import.meta.url);
const secret = (bytes = 32) => randomBytes(bytes).toString('base64url');
const replacements = {
  MYSQL_PASSWORD: secret(24),
  MYSQL_ROOT_PASSWORD: secret(32),
  MINIO_ACCESS_KEY: `minio_${randomBytes(8).toString('hex')}`,
  MINIO_SECRET_KEY: secret(32),
  ADMIN_BOOTSTRAP_PASSWORD: secret(24),
  TOKEN_SIGNING_SECRET: secret(48),
  PHONE_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
};

let content = await readFile(template, 'utf8');
for (const [name, value] of Object.entries(replacements)) {
  content = content.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${value}`);
}

await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log('local-env=created path=.env');
```

Create `docker-compose.yml`:

```yaml
name: scheduling-new

services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE:-scheduling}
      MYSQL_USER: ${MYSQL_USER:-scheduling_app}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?set MYSQL_PASSWORD in .env}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?set MYSQL_ROOT_PASSWORD in .env}
      TZ: UTC
    ports:
      - "${MYSQL_PORT:-3307}:3306"
    command:
      - --default-time-zone=+00:00
      - --sql-mode=STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
    volumes:
      - scheduling_mysql:/var/lib/mysql
      - ./infra/mysql/conf.d/charset.cnf:/etc/mysql/conf.d/charset.cnf:ro
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p$$MYSQL_ROOT_PASSWORD --silent"]
      interval: 3s
      timeout: 5s
      retries: 30
      start_period: 15s
    restart: unless-stopped

  redis:
    image: redis:7.4-alpine
    ports:
      - "${REDIS_PORT:-6380}:6379"
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    volumes:
      - scheduling_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 20
    restart: unless-stopped

  minio:
    image: minio/minio:RELEASE.2025-04-22T22-12-26Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:?set MINIO_ACCESS_KEY in .env}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:?set MINIO_SECRET_KEY in .env}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - scheduling_minio:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 20
    restart: unless-stopped

volumes:
  scheduling_mysql:
  scheduling_redis:
  scheduling_minio:
```

Create `infra/mysql/conf.d/charset.cnf`:

```ini
[mysqld]
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
explicit_defaults_for_timestamp=ON
```

- [ ] **Step 4: Validate and start infrastructure**

Run: `npm run env:init`, then run `docker compose config --quiet`.

Expected: exit 0.

Run: `docker compose up -d mysql redis minio`

Expected: all three containers start.

Run: `node tools/check-infrastructure.mjs`

Expected: `infrastructure=healthy`.

- [ ] **Step 5: Commit infrastructure**

```bash
git add new/.env.example new/docker-compose.yml new/infra/mysql/conf.d/charset.cnf new/tools/init-local-env.mjs new/tools/check-infrastructure.mjs
git commit -m "chore(new): add local infrastructure"
```

### Task 4: Bootstrap the API and validate configuration

**Files:**
- Create: `services/api/package.json`
- Create: `services/api/tsconfig.json`
- Create: `services/api/vitest.config.ts`
- Create: `services/api/src/config/env.schema.ts`
- Test: `services/api/test/config.test.ts`

- [ ] **Step 1: Write configuration tests**

Create `services/api/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.schema.js';

const valid = {
  NODE_ENV: 'test',
  API_PORT: '3000',
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3307',
  MYSQL_DATABASE: 'scheduling',
  MYSQL_USER: 'scheduling_app',
  MYSQL_PASSWORD: 'local-password',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '6380',
  WECHAT_MODE: 'mock',
  TOKEN_SIGNING_SECRET: '12345678901234567890123456789012',
  PHONE_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

describe('parseEnvironment', () => {
  it('coerces numeric ports', () => {
    expect(parseEnvironment(valid).MYSQL_PORT).toBe(3307);
  });

  it('rejects production mock mode', () => {
    expect(() => parseEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow(/WECHAT_MODE/);
  });
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `npm test -w @scheduling/api`

Expected: FAIL because the API package or parser does not exist.

- [ ] **Step 3: Create the API package and parser**

Create `services/api/package.json`:

```json
{
  "name": "@scheduling/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --env-file=../../.env --import tsx src/main.ts",
    "start": "node --env-file=../../.env dist/main.js",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "pretest": "npm run build -w @scheduling/contracts",
    "test": "vitest run",
    "db:migrate": "node --env-file=../../.env --import tsx src/database/run-migrations.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.3",
    "@nestjs/core": "^11.1.3",
    "@nestjs/platform-fastify": "^11.1.3",
    "@scheduling/contracts": "*",
    "fastify": "^5.4.0",
    "ioredis": "^5.6.1",
    "kysely": "^0.28.2",
    "mysql2": "^3.14.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.0.5"
  },
  "devDependencies": {
    "@types/node": "^22.15.32",
    "tsx": "^4.20.3",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Create `services/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `services/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
  },
});
```

Create `services/api/test/setup-env.ts`:

```ts
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // Unit-only runs can use deterministic test values; integration tests require `npm run env:init`.
}

const defaults = {
  NODE_ENV: 'test',
  API_PORT: '3000',
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3307',
  MYSQL_DATABASE: 'scheduling',
  MYSQL_USER: 'scheduling_app',
  MYSQL_PASSWORD: 'test-only-password',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '6380',
  WECHAT_MODE: 'mock',
  TOKEN_SIGNING_SECRET: '12345678901234567890123456789012',
  PHONE_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

for (const [name, value] of Object.entries(defaults)) {
  if (!process.env[name]) process.env[name] = value;
}
```

Create `services/api/src/config/env.schema.ts`:

```ts
import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: port.default(3000),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: port,
  MYSQL_DATABASE: z.string().regex(/^[a-z0-9_]+$/),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().min(8),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: port,
  WECHAT_MODE: z.enum(['mock', 'production']),
  TOKEN_SIGNING_SECRET: z.string().min(32),
  PHONE_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i),
});

export type Environment = z.infer<typeof schema>;

export function parseEnvironment(input: NodeJS.ProcessEnv | Record<string, string>): Environment {
  const value = schema.parse(input);
  if (value.NODE_ENV === 'production' && value.WECHAT_MODE !== 'production') {
    throw new Error('WECHAT_MODE must be production when NODE_ENV=production');
  }
  return value;
}
```

- [ ] **Step 4: Install and verify configuration**

Run: `npm install`

Run: `npm test -w @scheduling/api -- config.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit API configuration**

```bash
git add new/package-lock.json new/services/api
git commit -m "feat(new): bootstrap validated API configuration"
```

### Task 5: Add MySQL migrations and connection lifecycle

**Files:**
- Create: `services/api/src/database/database.client.ts`
- Create: `services/api/src/database/database.lifecycle.ts`
- Create: `services/api/src/database/database.module.ts`
- Create: `services/api/src/database/database.tokens.ts`
- Create: `services/api/src/database/migrations/001_foundation.ts`
- Create: `services/api/src/database/run-migrations.ts`
- Test: `services/api/test/database.integration.test.ts`

- [ ] **Step 1: Write the failing database integration test**

Create `services/api/test/database.integration.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from '../src/database/database.client.js';
import { parseEnvironment } from '../src/config/env.schema.js';

const env = parseEnvironment({ ...process.env, NODE_ENV: 'test' });

const db = createDatabase(env);
afterAll(() => db.destroy());

describe('database foundation', () => {
  it('connects with the application account', async () => {
    const result = await sql<{ value: number }>`select 1 as value`.execute(db);
    expect(result.rows[0]?.value).toBe(1);
  });

  it('has the foundation tables after migrations', async () => {
    const result = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = ${env.MYSQL_DATABASE} and table_name = 'admin_accounts'
    `.execute(db);
    expect(result.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the table test before migrations**

Run: `npm test -w @scheduling/api -- database.integration.test.ts`

Expected: connection test PASS and table test FAIL with zero rows.

- [ ] **Step 3: Implement database client and migration**

Create `services/api/src/database/database.tokens.ts`:

```ts
export const DATABASE = Symbol('DATABASE');
```

Create `services/api/src/database/database.client.ts`:

```ts
import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import type { Environment } from '../config/env.schema.js';

export function createDatabase(env: Environment): Kysely<unknown> {
  return new Kysely({
    dialect: new MysqlDialect({
      pool: createPool({
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        database: env.MYSQL_DATABASE,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        connectionLimit: 10,
        timezone: 'Z',
        charset: 'utf8mb4',
      }),
    }),
  });
}
```

Create `services/api/src/database/migrations/001_foundation.ts`:

```ts
import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('openid', 'varchar(64)', (c) => c.unique())
    .addColumn('nickname', 'varchar(80)', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('active'))
    .addColumn('anonymized_at', 'datetime(3)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .execute();

  await db.schema
    .createTable('admin_accounts')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('username', 'varchar(64)', (c) => c.notNull().unique())
    .addColumn('password_hash', 'varchar(255)', (c) => c.notNull())
    .addColumn('role', 'varchar(24)', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('active'))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .execute();

  await db.schema
    .createTable('audit_logs')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('actor_type', 'varchar(24)', (c) => c.notNull())
    .addColumn('actor_id', sql`binary(16)`)
    .addColumn('action', 'varchar(96)', (c) => c.notNull())
    .addColumn('target_type', 'varchar(64)', (c) => c.notNull())
    .addColumn('target_id', sql`binary(16)`)
    .addColumn('request_id', 'varchar(64)', (c) => c.notNull())
    .addColumn('metadata_json', 'json')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .execute();

  await db.schema.createIndex('idx_audit_created_at').on('audit_logs').column('created_at').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('audit_logs').execute();
  await db.schema.dropTable('admin_accounts').execute();
  await db.schema.dropTable('users').execute();
}
```

Create `services/api/src/database/run-migrations.ts`:

```ts
import { FileMigrationProvider, Migrator } from 'kysely';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvironment } from '../config/env.schema.js';
import { createDatabase } from './database.client.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = parseEnvironment(process.env);
const db = createDatabase(env);

try {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: path.join(dirname, 'migrations') }),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) console.log(`migration=${result.migrationName} status=${result.status}`);
  if (error) throw error;
} finally {
  await db.destroy();
}
```

Create `services/api/src/database/database.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { parseEnvironment } from '../config/env.schema.js';
import { createDatabase } from './database.client.js';
import { DatabaseLifecycle } from './database.lifecycle.js';
import { DATABASE } from './database.tokens.js';

@Global()
@Module({
  providers: [
    { provide: DATABASE, useFactory: () => createDatabase(parseEnvironment(process.env)) },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
```

Create `services/api/src/database/database.lifecycle.ts`:

```ts
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.tokens.js';

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
```

- [ ] **Step 4: Run migrations and database tests**

Ensure `.env` exists from Task 3, then run: `npm run db:migrate`.

Expected: `001_foundation status=Success`.

Run: `npm test -w @scheduling/api -- database.integration.test.ts`

Expected: both tests PASS.

- [ ] **Step 5: Commit database foundation**

```bash
git add new/services/api/src/database new/services/api/test/database.integration.test.ts
git commit -m "feat(new): add MySQL foundation migrations"
```

### Task 6: Add Redis and health endpoints

**Files:**
- Create: `services/api/src/redis/redis.module.ts`
- Create: `services/api/src/redis/redis.lifecycle.ts`
- Create: `services/api/src/redis/redis.tokens.ts`
- Create: `services/api/src/health/health.service.ts`
- Create: `services/api/src/health/health.controller.ts`
- Create: `services/api/src/health/health.module.ts`
- Create: `services/api/src/app.module.ts`
- Create: `services/api/src/main.ts`
- Test: `services/api/test/health.integration.test.ts`

- [ ] **Step 1: Write the failing health test**

Create `services/api/test/health.integration.test.ts`:

```ts
import 'reflect-metadata';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
let adapter: FastifyAdapter;

beforeAll(async () => {
  adapter = new FastifyAdapter({ logger: false });
  app = await NestFactory.create(AppModule, adapter, { logger: false });
  await app.init();
  await adapter.getInstance().ready();
});

afterAll(async () => app.close());

describe('health endpoints', () => {
  it('reports process liveness', async () => {
    const response = await adapter.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('reports MySQL and Redis readiness', async () => {
    const response = await adapter.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', mysql: 'up', redis: 'up' });
  });
});
```

- [ ] **Step 2: Confirm the health test fails**

Run: `npm test -w @scheduling/api -- health.integration.test.ts`

Expected: FAIL because `AppModule` does not exist.

- [ ] **Step 3: Implement Redis and health modules**

Create `services/api/src/redis/redis.tokens.ts`:

```ts
export const REDIS = Symbol('REDIS');
```

Create `services/api/src/redis/redis.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { parseEnvironment } from '../config/env.schema.js';
import { RedisLifecycle } from './redis.lifecycle.js';
import { REDIS } from './redis.tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        const env = parseEnvironment(process.env);
        return new Redis({ host: env.REDIS_HOST, port: env.REDIS_PORT, lazyConnect: true, maxRetriesPerRequest: 1 });
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
```

Create `services/api/src/redis/redis.lifecycle.ts`:

```ts
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from './redis.tokens.js';

@Injectable()
export class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}
```

Create `services/api/src/health/health.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { type Kysely, sql } from 'kysely';
import { DATABASE } from '../database/database.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<unknown>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async ready(): Promise<{ status: 'ready'; mysql: 'up'; redis: 'up' }> {
    await sql`select 1`.execute(this.db);
    if (this.redis.status === 'wait') await this.redis.connect();
    const pong = await this.redis.ping();
    if (pong !== 'PONG') throw new Error('Redis ping did not return PONG');
    return { status: 'ready', mysql: 'up', redis: 'up' };
  }
}
```

Create `services/api/src/health/health.controller.ts`:

```ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    try {
      return await this.health.ready();
    } catch {
      throw new ServiceUnavailableException('Dependencies are not ready');
    }
  }
}
```

Create `services/api/src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
```

Create `services/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({ imports: [DatabaseModule, RedisModule, HealthModule] })
export class AppModule {}
```

Create `services/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { parseEnvironment } from './config/env.schema.js';

const env = parseEnvironment(process.env);
const adapter = new FastifyAdapter({
  logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
  genReqId: (request) => String(request.headers['x-request-id'] ?? randomUUID()),
});
adapter.getInstance().addHook('onRequest', async (request, reply) => {
  reply.header('x-request-id', request.id);
});

const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
app.enableShutdownHooks();
await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
```

- [ ] **Step 4: Run health tests and build**

Run: `npm test -w @scheduling/api -- health.integration.test.ts`

Expected: 2 tests PASS.

Run: `npm run build -w @scheduling/api`

Expected: TypeScript exits 0.

- [ ] **Step 5: Commit health foundation**

```bash
git add new/services/api/src/redis new/services/api/src/health new/services/api/src/app.module.ts new/services/api/src/main.ts new/services/api/test/health.integration.test.ts
git commit -m "feat(new): add dependency health endpoints"
```

### Task 7: Add the stable error envelope

**Files:**
- Create: `services/api/src/http/api-exception.filter.ts`
- Create: `services/api/src/http/error-response.ts`
- Modify: `services/api/src/main.ts`
- Test: `services/api/test/error-response.test.ts`

- [ ] **Step 1: Write the failing error-response test**

Create `services/api/test/error-response.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildErrorResponse } from '../src/http/error-response.js';

describe('buildErrorResponse', () => {
  it('builds the stable dependency error envelope', () => {
    expect(buildErrorResponse('DEPENDENCY_UNAVAILABLE', 'Dependencies are not ready', 'req-1')).toEqual({
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Dependencies are not ready',
        requestId: 'req-1',
      },
    });
  });
});
```

- [ ] **Step 2: Confirm the error test fails**

Run: `npm test -w @scheduling/api -- error-response.test.ts`

Expected: FAIL because `error-response.ts` does not exist.

- [ ] **Step 3: Implement the error builder and global filter**

Create `services/api/src/http/error-response.ts`:

```ts
import type { ApiErrorCode, ApiErrorResponse } from '@scheduling/contracts';

export function buildErrorResponse(code: ApiErrorCode, message: string, requestId: string): ApiErrorResponse {
  return { error: { code, message, requestId } };
}
```

Create `services/api/src/http/api-exception.filter.ts`:

```ts
import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorCode } from '@scheduling/contracts';
import { buildErrorResponse } from './error-response.js';

const statusCodes: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'INVALID_ARGUMENT',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'PERMISSION_DENIED',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'VERSION_CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'DEPENDENCY_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.message : 'Internal server error';
    const code = statusCodes[status] ?? 'INTERNAL';
    reply.status(status).send(buildErrorResponse(code, raw, request.id));
  }
}
```

Register the filter in `services/api/src/main.ts` immediately after application creation:

```ts
import { ApiExceptionFilter } from './http/api-exception.filter.js';

app.useGlobalFilters(new ApiExceptionFilter());
```

- [ ] **Step 4: Verify contracts and API**

Run: `npm run build -w @scheduling/contracts && npm test -w @scheduling/api && npm run typecheck -w @scheduling/api`

Expected: all tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit HTTP conventions**

```bash
git add new/services/api/src/http new/services/api/src/main.ts new/services/api/test/error-response.test.ts
git commit -m "feat(new): standardize API error responses"
```

### Task 8: Add black-box smoke test and local runbook

**Files:**
- Create: `tools/smoke-foundation.mjs`
- Create: `docs/operations/local-foundation.md`
- Modify: `package.json`

- [ ] **Step 1: Write the smoke test before adding the script entry**

Create `tools/smoke-foundation.mjs`:

```js
const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json(), requestId: response.headers.get('x-request-id') };
}

const live = await get('/health/live');
if (live.status !== 200 || live.body.status !== 'ok') throw new Error(`live failed: ${JSON.stringify(live)}`);

const ready = await get('/health/ready');
if (ready.status !== 200 || ready.body.status !== 'ready') throw new Error(`ready failed: ${JSON.stringify(ready)}`);
if (!ready.requestId) throw new Error('x-request-id header missing');

console.log('foundation-smoke=ok');
```

- [ ] **Step 2: Confirm the smoke command is unavailable**

Run: `npm run smoke:foundation`

Expected: FAIL with `Missing script: smoke:foundation`.

- [ ] **Step 3: Add the script and runbook**

Add to root `package.json` scripts:

```json
"smoke:foundation": "node tools/smoke-foundation.mjs"
```

Create `docs/operations/local-foundation.md` with these exact operational rules:

```markdown
# Local Foundation Runbook

## Start

1. Start Docker Desktop and wait for `docker info` to succeed.
2. Run `npm run env:init`; it creates a random, Git-ignored `.env` and refuses to overwrite an existing file.
3. Run `npm ci`.
4. Run `npm run infra:up` and `node tools/check-infrastructure.mjs`.
5. Load `.env` into the shell and run `npm run db:migrate`.
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
```

- [ ] **Step 4: Run the complete foundation verification**

With the API running, run:

```bash
npm run check:workspace
npm run build
npm test
npm run smoke:foundation
```

Expected: workspace check OK, all builds/tests pass, and `foundation-smoke=ok`.

- [ ] **Step 5: Verify dependency failure behavior**

Run: `docker compose stop mysql`

Run: `curl.exe -i http://127.0.0.1:3000/health/live`

Expected: HTTP 200.

Run: `curl.exe -i http://127.0.0.1:3000/health/ready`

Expected: HTTP 503 with error code `DEPENDENCY_UNAVAILABLE` and a non-empty request ID.

Run: `docker compose start mysql`

Expected: MySQL returns healthy and readiness returns 200 again.

- [ ] **Step 6: Commit runbook and smoke verification**

```bash
git add new/package.json new/tools/smoke-foundation.mjs new/docs/operations/local-foundation.md
git commit -m "test(new): add foundation smoke verification"
```

## Foundation Completion Check

- [ ] `git diff --check` reports no errors for `new`.
- [ ] `npm run check:workspace`, `npm run build`, `npm run typecheck`, and `npm test` pass.
- [ ] MySQL, Redis and MinIO are healthy through Docker Compose.
- [ ] Migrations succeed on an empty database and are idempotent on a second run.
- [ ] Liveness/readiness and dependency-failure behavior match Task 8.
- [ ] No real secrets appear in tracked files or command output.
- [ ] Only the files listed in this phase are committed; legacy project changes remain untouched.
