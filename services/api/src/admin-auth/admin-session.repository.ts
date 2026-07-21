import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { newId, parseId, stringifyId } from '../ids/uuid.js';
import { DATABASE } from '../database/database.tokens.js';

export type AdminRecord = { id: string; username: string; passwordHash: string; role: 'admin' | 'superadmin'; status: string };
export type AdminSessionRecord = AdminRecord & { sessionId: string; expiresAt: Date; revokedAt: Date | null };

function adminFromRow(row: { id: Buffer; username: string; password_hash: string; role: 'admin' | 'superadmin'; status: string }): AdminRecord {
  return { id: stringifyId(row.id), username: row.username, passwordHash: row.password_hash, role: row.role, status: row.status };
}

@Injectable()
export class AdminSessionRepository {
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>) {}

  async findByUsername(username: string): Promise<AdminRecord | null> {
    const result = await sql<{ id: Buffer; username: string; password_hash: string; role: 'admin' | 'superadmin'; status: string }>`
      select id, username, password_hash, role, status from admin_accounts where username = ${username} limit 1
    `.execute(this.db);
    return result.rows[0] ? adminFromRow(result.rows[0]) : null;
  }

  async create(username: string, passwordHash: string, role: 'admin' | 'superadmin' = 'superadmin'): Promise<AdminRecord> {
    const id = newId();
    await sql`
      insert into admin_accounts (id, username, password_hash, role, status)
      values (${parseId(id)}, ${username}, ${passwordHash}, ${role}, 'active')
    `.execute(this.db);
    return { id, username, passwordHash, role, status: 'active' };
  }

  async createSession(adminId: string, hash: string, expiresAt: Date, userAgent: string | null, ipAddress: string | null): Promise<string> {
    const id = newId();
    await sql`
      insert into admin_sessions (id, admin_id, refresh_token_hash, expires_at, last_used_at, user_agent, ip_address)
      values (${parseId(id)}, ${parseId(adminId)}, ${hash}, ${expiresAt}, current_timestamp(3), ${userAgent}, ${ipAddress})
    `.execute(this.db);
    return id;
  }

  async findByRefreshHash(hash: string): Promise<AdminSessionRecord | null> {
    const result = await sql<{
      session_id: Buffer; expires_at: Date; revoked_at: Date | null; id: Buffer; username: string; password_hash: string;
      role: 'admin' | 'superadmin'; status: string;
    }>`
      select s.id as session_id, s.expires_at, s.revoked_at, a.id, a.username, a.password_hash, a.role, a.status
      from admin_sessions s join admin_accounts a on a.id = s.admin_id
      where s.refresh_token_hash = ${hash} limit 1
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    return { ...adminFromRow(row), sessionId: stringifyId(row.session_id), expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await sql`update admin_sessions set revoked_at = current_timestamp(3), last_used_at = current_timestamp(3) where id = ${parseId(sessionId)}`.execute(this.db);
  }
}
