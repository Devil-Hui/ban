import { randomBytes } from 'node:crypto';

/**
 * Crockford-like 邀请码字母表：去掉了易混淆字符 0/O/1/I/L
 * 分组邀请码、任务收集分享码统一使用此工具生成，保证一致性和无碰撞。
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 生成固定长度的邀请码（默认 8 位） */
export function generateInviteCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}
