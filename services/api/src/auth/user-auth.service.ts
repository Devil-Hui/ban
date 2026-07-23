import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokenService } from './token.service.js';
import { WechatLoginAdapter } from './wechat-login.adapter.js';
import { UserRepository } from '../users/user.repository.js';

@Injectable()
export class UserAuthService {
  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(WechatLoginAdapter) private readonly wechat: WechatLoginAdapter,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  async login(code: string, request: FastifyRequest) {
    const identity = await this.wechat.exchange(code);
    const user = await this.users.upsertWechat(identity.openid, identity.nickname, identity.avatarUrl);
    return this.issueTokens(user, request);
  }

  /** 微信手机号一键授权登录：同时换 openid + 手机号，upsert 用户 */
  async phoneLogin(code: string, phoneCode: string, request: FastifyRequest) {
    const identity = await this.wechat.exchange(code);
    const user = await this.users.upsertWechat(identity.openid, identity.nickname, identity.avatarUrl);
    // 手机号来自微信官方校验，此处仅验证有效性；持久化由 POST /users/me/phone 处理
    await this.wechat.exchangePhone(phoneCode);
    return this.issueTokens(user, request);
  }

  private async issueTokens(user: { id: string; nickname: string; avatarUrl: string | null }, request: FastifyRequest) {
    const accessToken = await this.tokens.issueAccess({ type: 'user', subject: user.id });
    const refreshToken = this.tokens.issueRefreshToken();
    await this.users.createSession(
      user.id,
      this.tokens.hashRefreshToken(refreshToken),
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
      request.ip ?? null,
    );
    return { accessToken, refreshToken, user };
  }
  async refresh(refreshToken: string, request: FastifyRequest) {
    const session = await this.users.findSessionByRefreshHash(this.tokens.hashRefreshToken(refreshToken));
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.status !== 'active') throw new UnauthorizedException('Invalid refresh token');
    if (!(await this.users.revokeActiveSession(session.sessionId))) throw new UnauthorizedException('Invalid refresh token');
    const accessToken = await this.tokens.issueAccess({ type: 'user', subject: session.user.id });
    const nextRefreshToken = this.tokens.issueRefreshToken();
    await this.users.createSession(session.user.id, this.tokens.hashRefreshToken(nextRefreshToken), new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null, request.ip ?? null);
    return { accessToken, refreshToken: nextRefreshToken, user: session.user };
  }
  async logout(refreshToken: string) { const session = await this.users.findSessionByRefreshHash(this.tokens.hashRefreshToken(refreshToken)); if (session && !session.revokedAt) await this.users.revokeActiveSession(session.sessionId); }
}
