import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis as RedisClient } from 'ioredis';
import { REDIS } from './redis.tokens.js';

@Injectable()
export class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') return;
    await this.redis.quit();
  }
}
