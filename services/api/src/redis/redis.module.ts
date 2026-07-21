import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
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
        return new Redis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
