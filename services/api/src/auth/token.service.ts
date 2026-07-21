import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { AdminPrincipal, Principal, UserPrincipal } from './auth.types.js';

const ISSUER = 'scheduling-api';
const AUDIENCES = { user: 'mini-user', admin: 'admin-h5' } as const;

export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    if (secret.length < 32) throw new Error('token secret must be at least 32 characters');
    this.key = new TextEncoder().encode(secret);
  }

  async issueAccess(principal: Principal, expiresInSeconds = 900): Promise<string> {
    const payload = principal.type === 'admin' ? { type: principal.type, role: principal.role } : { type: principal.type };
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCES[principal.type])
      .setSubject(principal.subject)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
      .sign(this.key);
  }

  async verifyAccess(token: string, expected: 'user' | 'admin'): Promise<UserPrincipal | AdminPrincipal> {
    const { payload } = await jwtVerify<Record<string, unknown>>(token, this.key, {
      issuer: ISSUER,
      audience: AUDIENCES[expected],
    });
    if (payload.type !== expected || typeof payload.sub !== 'string') throw new Error('invalid principal');
    if (expected === 'admin' && payload.role !== 'admin' && payload.role !== 'superadmin') {
      throw new Error('invalid admin role');
    }
    return expected === 'admin'
      ? { type: 'admin', subject: payload.sub, role: payload.role as AdminPrincipal['role'] }
      : { type: 'user', subject: payload.sub };
  }

  issueRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
