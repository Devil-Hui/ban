import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedPhone = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: string;
};

export class PrivacyService {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('phone encryption key must be 32 bytes');
    this.key = key;
  }

  encryptPhone(phone: string): EncryptedPhone {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: 'v1' };
  }

  decryptPhone(value: EncryptedPhone): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, value.iv);
    decipher.setAuthTag(value.authTag);
    return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString('utf8');
  }

  projectMaskedPhone(value: EncryptedPhone, allowed: boolean): string | null {
    if (!allowed) return null;
    const phone = this.decryptPhone(value);
    if (!/^\d{7,15}$/.test(phone)) return null;
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}
