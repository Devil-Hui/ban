import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { newId, parseId, stringifyId } from '../ids/uuid.js';
import { DATABASE } from '../database/database.tokens.js';

export type UserRecord = { id: string; nickname: string; avatarUrl: string | null };

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>) {}

  async upsertWechat(openid: string, nickname: string, avatarUrl: string | null): Promise<UserRecord> {
    return this.db.transaction().execute(async (trx) => {
      const existing = await sql<{ id: Buffer; nickname: string; avatar_url: string | null }>`
        select id, nickname, avatar_url from users where openid = ${openid} limit 1
      `.execute(trx);
      if (existing.rows[0]) {
        const row = existing.rows[0];
        await sql`
          update users set nickname = ${nickname}, avatar_url = ${avatarUrl}, last_login_at = current_timestamp(3)
          where id = ${row.id}
        `.execute(trx);
        return { id: stringifyId(row.id), nickname, avatarUrl };
      }

      const id = newId();
      await sql`
        insert into users (id, openid, nickname, avatar_url, last_login_at)
        values (${parseId(id)}, ${openid}, ${nickname}, ${avatarUrl}, current_timestamp(3))
      `.execute(trx);
      return { id, nickname, avatarUrl };
    });
  }

  /** Develop WECHAT_MODE=mock identities live in DB (wechat_mock_identities). */
  async findMockWechatIdentity(code: string): Promise<{ openid: string; nickname: string; avatarUrl: string | null } | null> {
    const result = await sql<{ openid: string; nickname: string; avatar_url: string | null }>`
      select openid, nickname, avatar_url
      from wechat_mock_identities
      where code = ${code} and is_active = true
      limit 1
    `.execute(this.db);
    const row = result.rows[0];
    return row ? { openid: row.openid, nickname: row.nickname, avatarUrl: row.avatar_url } : null;
  }

  async createSession(userId: string, refreshTokenHash: string, expiresAt: Date, userAgent: string | null, ipAddress: string | null): Promise<void> {
    await sql`
      insert into user_sessions (id, user_id, refresh_token_hash, expires_at, user_agent, ip_address, last_used_at)
      values (${parseId(newId())}, ${parseId(userId)}, ${refreshTokenHash}, ${expiresAt}, ${userAgent}, ${ipAddress}, current_timestamp(3))
    `.execute(this.db);
  }
  async findSessionByRefreshHash(hash: string) { const result = await sql<any>`select s.id as session_id, s.user_id, s.expires_at, s.revoked_at, u.nickname, u.avatar_url, u.status from user_sessions s join users u on u.id = s.user_id where s.refresh_token_hash = ${hash} limit 1`.execute(this.db); const row = result.rows[0]; return row ? { sessionId: stringifyId(row.session_id), user: { id: stringifyId(row.user_id), nickname: row.nickname, avatarUrl: row.avatar_url }, expiresAt: row.expires_at, revokedAt: row.revoked_at, status: row.status } : null; }
  async revokeActiveSession(sessionId: string) {
    const result = await sql`update user_sessions set revoked_at = current_timestamp(3), last_used_at = current_timestamp(3) where id = ${parseId(sessionId)} and revoked_at is null`.execute(this.db);
    return Number((result as any).numAffectedRows) === 1;
  }

  async savePhone(userId: string, value: { ciphertext: Buffer; iv: Buffer; authTag: Buffer; keyVersion: string }) {
    await sql`insert into user_private_profiles (user_id, phone_ciphertext, phone_iv, phone_auth_tag, phone_key_version, phone_authorized_at) values (${parseId(userId)}, ${value.ciphertext}, ${value.iv}, ${value.authTag}, ${value.keyVersion}, current_timestamp(3)) on duplicate key update phone_ciphertext = values(phone_ciphertext), phone_iv = values(phone_iv), phone_auth_tag = values(phone_auth_tag), phone_key_version = values(phone_key_version), phone_authorized_at = current_timestamp(3), deleted_at = null`.execute(this.db);
  }
  async encryptedPhone(userId: string) { const result = await sql<any>`select phone_ciphertext, phone_iv, phone_auth_tag, phone_key_version from user_private_profiles where user_id = ${parseId(userId)} and deleted_at is null limit 1`.execute(this.db); const row = result.rows[0]; return row ? { ciphertext: row.phone_ciphertext, iv: row.phone_iv, authTag: row.phone_auth_tag, keyVersion: row.phone_key_version } : null; }
  async requestDeletion(userId: string) { const existing = await sql<any>`select id, execute_after from user_deletion_requests where user_id = ${parseId(userId)} and status = 'pending' limit 1`.execute(this.db); if (existing.rows[0]) return { executeAfter: existing.rows[0].execute_after }; const executeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); await sql`insert into user_deletion_requests (id, user_id, execute_after) values (${parseId(newId())}, ${parseId(userId)}, ${executeAfter})`.execute(this.db); return { executeAfter }; }
  async cancelDeletion(userId: string) { await sql`update user_deletion_requests set status = 'cancelled', cancelled_at = current_timestamp(3) where user_id = ${parseId(userId)} and status = 'pending'`.execute(this.db); }
}
