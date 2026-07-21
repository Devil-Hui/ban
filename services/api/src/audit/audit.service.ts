import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { newId, parseId } from '../ids/uuid.js';
import { DATABASE } from '../database/database.tokens.js';

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>) {}

  async record(input: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    requestId: string;
    metadata?: Record<string, unknown>;
    actorType?: 'user' | 'admin' | 'system';
  }, executor: Kysely<unknown> = this.db): Promise<void> {
    await sql`
      insert into audit_logs (id, actor_type, actor_id, action, target_type, target_id, request_id, metadata_json)
      values (${parseId(newId())}, ${input.actorType ?? 'user'}, ${input.actorId ? parseId(input.actorId) : null}, ${input.action}, ${input.targetType}, ${input.targetId ? parseId(input.targetId) : null}, ${input.requestId}, ${input.metadata ? JSON.stringify(input.metadata) : null})
    `.execute(executor);
  }
}
