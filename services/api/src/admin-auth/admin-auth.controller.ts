import { Body, Controller, Delete, HttpCode, HttpStatus, Inject, Post, Req, BadRequestException, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminAuthGuard } from '../auth/auth.guard.js';
import type { AdminPrincipal } from '../auth/auth.types.js';
import { AdminMfaService } from './admin-mfa.service.js';

function stringField(body: unknown, name: string): string {
  if (typeof body !== 'object' || body === null) throw new BadRequestException(`${name} is required`);
  const value = (body as Record<string, unknown>)[name];
  if (typeof value !== 'string') throw new BadRequestException(`${name} is required`);
  return value.trim();
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(@Inject(AdminAuthService) private readonly auth: AdminAuthService, @Inject(AdminMfaService) private readonly mfa: AdminMfaService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: unknown, @Req() request: FastifyRequest) {
    const totpCode = typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).totpCode === 'string' ? String((body as Record<string, unknown>).totpCode) : undefined;
    return this.auth.login(stringField(body, 'username'), stringField(body, 'password'), request, totpCode);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: unknown, @Req() request: FastifyRequest) {
    return this.auth.refresh(stringField(body, 'refreshToken'), request);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown) {
    await this.auth.logout(stringField(body, 'refreshToken'));
  }

  @Post('mfa/enroll')
  @UseGuards(AdminAuthGuard)
  enroll(@Req() request: FastifyRequest & { principal: AdminPrincipal }) { return this.mfa.enroll(request.principal.subject, request.principal.subject); }

  @Delete('mfa')
  @UseGuards(AdminAuthGuard)
  async disable(@Req() request: FastifyRequest & { principal: AdminPrincipal }) { await this.mfa.disable(request.principal.subject); }
}
