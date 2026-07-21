import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from '../database/database.tokens.js';
import { newId, parseId, stringifyId } from '../ids/uuid.js';

@Injectable()
export class OutboxService {
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>) {}
  async enqueueUser(userId: string, eventType: string, payload: Record<string, unknown>, businessKey: string, executor: Kysely<unknown> = this.db) {
    await sql`insert ignore into notification_outbox (id, business_key, recipient_user_id, event_type, payload_json) values (${parseId(newId())}, ${businessKey}, ${parseId(userId)}, ${eventType}, ${JSON.stringify(payload)})`.execute(executor);
  }
  async enqueueGroup(groupId: string, eventType: string, payload: Record<string, unknown>, businessPrefix: string, executor: Kysely<unknown> = this.db) {
    const members = await sql<{ user_id: Buffer }>`select user_id from group_members where group_id = ${parseId(groupId)} and status = 'active'`.execute(executor);
    for (const member of members.rows) {
      const userId = stringifyId(member.user_id);
      await this.enqueueUser(userId, eventType, payload, `${businessPrefix}:${userId}`, executor);
    }
  }
}
