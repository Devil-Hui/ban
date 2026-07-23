import { type Kysely, sql } from 'kysely';
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // 获取所有未撤销的邀请码
  const rows = await sql<{ id: Buffer; code: string }>`
    select id, code from group_invite_codes where revoked_at is null
  `.execute(db);

  for (const row of rows.rows) {
    const newCode = generateCode(8);
    await sql`
      update group_invite_codes set code = ${newCode} where id = ${row.id}
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // 无法还原，跳过
}
