import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { FastifyRequest } from 'fastify';
import { AdminSessionRepository } from './admin-session.repository.js';
import { TokenService } from '../auth/token.service.js';
import { AdminMfaService } from './admin-mfa.service.js';

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(AdminSessionRepository) private readonly sessions: AdminSessionRepository,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AdminMfaService) private readonly mfa: AdminMfaService,
  ) {}

  async bootstrap(username: string, password: string): Promise<void> {
    if (password.length < 12) throw new Error('bootstrap password must be at least 12 characters');
    if (await this.sessions.findByUsername(username)) return;
    const passwordHash = await hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await this.sessions.create(username, passwordHash, 'superadmin');
  }

  async login(username: string, password: string, request: FastifyRequest, totpCode?: string) {
    const admin = await this.sessions.findByUsername(username);
    if (!admin || admin.status !== 'active' || !(await verify(admin.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!(await this.mfa.verify(admin.id, totpCode))) throw new UnauthorizedException('Invalid credentials');
    return this.issue(admin, request);
  }

  async refresh(refreshToken: string, request: FastifyRequest) {
    const session = await this.sessions.findByRefreshHash(this.tokens.hashRefreshToken(refreshToken));
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.status !== 'active') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.sessions.revokeSession(session.sessionId);
    return this.issue(session, request);
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessions.findByRefreshHash(this.tokens.hashRefreshToken(refreshToken));
    if (session && !session.revokedAt) await this.sessions.revokeSession(session.sessionId);
  }

  private async issue(admin: { id: string; username: string; role: 'admin' | 'superadmin' }, request: FastifyRequest) {
    const accessToken = await this.tokens.issueAccess({ type: 'admin', subject: admin.id, role: admin.role });
    const refreshToken = this.tokens.issueRefreshToken();
    await this.sessions.createSession(
      admin.id,
      this.tokens.hashRefreshToken(refreshToken),
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
      request.ip ?? null,
    );
    return { accessToken, refreshToken, admin: { id: admin.id, username: admin.username, role: admin.role } };
  }
}
