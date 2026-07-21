import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { DATABASE } from '../database/database.tokens.js';
import { newId, parseId } from '../ids/uuid.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes: Buffer) { let bits = ''; for (const byte of bytes) bits += byte.toString(2).padStart(8, '0'); let output = ''; for (let index = 0; index < bits.length; index += 5) output += ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)]; return output; }
function decodeBase32(value: string) { let bits = ''; for (const char of value.replace(/=+$/, '')) bits += ALPHABET.indexOf(char).toString(2).padStart(5, '0'); const result: number[] = []; for (let index = 0; index + 8 <= bits.length; index += 8) result.push(parseInt(bits.slice(index, index + 8), 2)); return Buffer.from(result); }
function codeAt(secret: string, step: number) { const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step)); const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest(); const offset = (digest[digest.length - 1] ?? 0) & 0xf; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0'); }

@Injectable()
export class AdminMfaService {
  private readonly key: Buffer;
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>) { this.key = createHash('sha256').update(`${process.env.TOKEN_SIGNING_SECRET ?? ''}:admin-mfa`).digest(); }
  async factorExists(adminId: string) { const result = await sql`select admin_id from admin_mfa_factors where admin_id = ${parseId(adminId)} limit 1`.execute(this.db); return Boolean(result.rows[0]); }
  async verify(adminId: string, input: string | undefined) {
    const result = await sql<any>`select secret_ciphertext, secret_iv, secret_auth_tag from admin_mfa_factors where admin_id = ${parseId(adminId)} limit 1`.execute(this.db);
    if (!result.rows[0]) return true;
    if (!input || !/^\d{6}$/.test(input)) return false;
    const row = result.rows[0]; const decipher = createDecipheriv('aes-256-gcm', this.key, row.secret_iv); decipher.setAuthTag(row.secret_auth_tag); const secret = Buffer.concat([decipher.update(row.secret_ciphertext), decipher.final()]).toString('ascii'); const step = Math.floor(Date.now() / 30_000); return [-1, 0, 1].some((offset) => codeAt(secret, step + offset) === input);
  }
  async enroll(adminId: string, username: string) {
    const secret = base32(randomBytes(20)); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv); const ciphertext = Buffer.concat([cipher.update(secret, 'ascii'), cipher.final()]); const tag = cipher.getAuthTag();
    await sql`insert into admin_mfa_factors (admin_id, secret_ciphertext, secret_iv, secret_auth_tag) values (${parseId(adminId)}, ${ciphertext}, ${iv}, ${tag}) on duplicate key update secret_ciphertext = values(secret_ciphertext), secret_iv = values(secret_iv), secret_auth_tag = values(secret_auth_tag), enabled_at = current_timestamp(3)`.execute(this.db);
    return { secret, otpauthUrl: `otpauth://totp/SmartScheduling:${encodeURIComponent(username)}?secret=${secret}&issuer=SmartScheduling` };
  }
  async disable(adminId: string) { await sql`delete from admin_mfa_factors where admin_id = ${parseId(adminId)}`.execute(this.db); }
}
