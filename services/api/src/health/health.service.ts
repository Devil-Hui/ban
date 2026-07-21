import { Inject, Injectable } from '@nestjs/common';
import type { Redis as RedisClient } from 'ioredis';
import { type Kysely, sql } from 'kysely';
import { DATABASE } from '../database/database.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<unknown>,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  async ready(): Promise<{ status: 'ready'; mysql: 'up'; redis: 'up' }> {
    await sql`select 1`.execute(this.db);
    if (this.redis.status === 'wait') await this.redis.connect();
    const pong = await this.redis.ping();
    if (pong !== 'PONG') throw new Error('Redis ping did not return PONG');
    return { status: 'ready', mysql: 'up', redis: 'up' };
  }
}
