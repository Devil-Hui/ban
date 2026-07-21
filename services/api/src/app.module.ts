import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AdminAuthModule } from './admin-auth/admin-auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { AdminOperationsModule } from './admin-operations/admin-operations.module.js';

@Module({ imports: [DatabaseModule, RedisModule, UsersModule, AuthModule, AdminAuthModule, GroupsModule, SchedulingModule, AdminOperationsModule, HealthModule] })
export class AppModule {}
