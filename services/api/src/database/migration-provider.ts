import { FileMigrationProvider } from 'kysely';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function createMigrationProvider(migrationFolder: string): FileMigrationProvider {
  return new FileMigrationProvider({
    fs,
    path: {
      join: (...parts) => pathToFileURL(path.join(...parts)).href,
    },
    migrationFolder,
  });
}
