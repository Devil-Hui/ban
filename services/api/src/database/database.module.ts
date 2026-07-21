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
