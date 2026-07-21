import { Inject, Injectable } from '@nestjs/common';
import { parseEnvironment } from '../config/env.schema.js';
import { UserRepository } from '../users/user.repository.js';

export type WechatIdentity = { openid: string; nickname: string; avatarUrl: string | null };

@Injectable()
export class WechatLoginAdapter {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

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
    // Nickname/avatar come from client profile later; openid is the stable identity key in DB.
    return { openid: body.openid, nickname: '微信用户', avatarUrl: null };
  }
}
