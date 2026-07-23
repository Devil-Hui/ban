import { Inject, Injectable } from '@nestjs/common';
import { parseEnvironment } from '../config/env.schema.js';
import { UserRepository } from '../users/user.repository.js';

export type WechatIdentity = { openid: string; nickname: string; avatarUrl: string | null };

@Injectable()
export class WechatLoginAdapter {
  private accessTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessTokenCache && Date.now() < this.accessTokenCache.expiresAt - 60_000) {
      return this.accessTokenCache.token;
    }
    const env = parseEnvironment(process.env);
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', env.WX_APPID);
    url.searchParams.set('secret', env.WX_SECRET);
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const body = (await response.json()) as { access_token?: string; expires_in?: number; errcode?: number };
    if (!body.access_token) throw new Error(`Failed to get WeChat access token: ${body.errcode ?? 'unknown'}`);
    this.accessTokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 7200) * 1000,
    };
    return body.access_token;
  }

  async exchange(code: string): Promise<WechatIdentity> {
    const env = parseEnvironment(process.env);
    if (env.WECHAT_MODE === 'mock') {
      const match = /^mock:([A-Za-z0-9_-]+)$/.exec(code);
      const scenarioId = match?.[1];
      if (!scenarioId) throw new Error('invalid mock WeChat code');
      const identity = await this.users.findMockWechatIdentity(scenarioId);
      if (!identity) throw new Error('invalid mock WeChat code');
      return identity;
    }

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', env.WX_APPID);
    url.searchParams.set('secret', env.WX_SECRET);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const body = (await response.json()) as { openid?: string; errcode?: number; errmsg?: string };
    if (!response.ok || !body.openid) throw new Error(`WeChat login failed: ${body.errcode ?? 'unknown'}`);
    return { openid: body.openid, nickname: '微信用户', avatarUrl: null };
  }

  /** 用 getPhoneNumber 返回的 code 换取手机号（不含区号） */
  async exchangePhone(phoneCode: string): Promise<string> {
    const env = parseEnvironment(process.env);
    if (env.WECHAT_MODE === 'mock') {
      const match = /^mock:phone:(1\d{10})$/.exec(phoneCode);
      if (match && match[1]) return match[1];
      return '13800138000';
    }

    const accessToken = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: phoneCode }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await response.json()) as {
      errcode: number; errmsg?: string;
      phone_info?: { purePhoneNumber?: string; phoneNumber?: string };
    };
    if (body.errcode !== 0 || !body.phone_info?.purePhoneNumber) {
      throw new Error(`WeChat phone exchange failed: ${body.errcode} ${body.errmsg ?? ''}`);
    }
    return body.phone_info.purePhoneNumber;
  }
}
