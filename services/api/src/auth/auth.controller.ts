import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UserAuthService } from './user-auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(UserAuthService) private readonly auth: UserAuthService) {}

  @Post('wechat/login')
  @HttpCode(HttpStatus.CREATED)
  async wechatLogin(@Body() body: unknown, @Req() request: FastifyRequest) {
    const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) throw new BadRequestException('code is required');
    return this.auth.login(code, request);
  }
  @Post('refresh') @HttpCode(HttpStatus.OK)
  refresh(@Body() body: any, @Req() request: FastifyRequest) { const token = typeof body?.refreshToken === 'string' ? body.refreshToken : ''; if (!token) throw new BadRequestException('refreshToken is required'); return this.auth.refresh(token, request); }
  @Post('logout') @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: any) { const token = typeof body?.refreshToken === 'string' ? body.refreshToken : ''; if (!token) throw new BadRequestException('refreshToken is required'); await this.auth.logout(token); }
}
