import { Migrator } from 'kysely';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvironment } from '../config/env.schema.js';
import { createDatabase } from './database.client.js';
import { createMigrationProvider } from './migration-provider.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = parseEnvironment(process.env);
const db = createDatabase(env);

try {
  const migrator = new Migrator({
    db,
    provider: createMigrationProvider(path.join(dirname, 'migrations')),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) console.log(`migration=${result.migrationName} status=${result.status}`);
  if (error) throw error;
} finally {
  await db.destroy();
}
