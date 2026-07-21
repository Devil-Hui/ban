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
