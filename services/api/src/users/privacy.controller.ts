import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UserAuthGuard } from '../auth/auth.guard.js';
import type { UserPrincipal } from '../auth/auth.types.js';
import { PrivacyService } from './privacy.service.js';
import { UserRepository } from './user.repository.js';

type UserRequest = FastifyRequest & { principal: UserPrincipal };
@Controller('users/me')
@UseGuards(UserAuthGuard)
export class PrivacyController {
  constructor(@Inject(UserRepository) private readonly users: UserRepository, @Inject(PrivacyService) private readonly privacy: PrivacyService) {}
  @Post('phone')
  async authorizePhone(@Body() body: any, @Req() request: UserRequest) { const phone = String(body?.phone ?? '').replace(/\s/g, ''); if (!/^\d{7,15}$/.test(phone)) throw new BadRequestException('Invalid phone number'); await this.users.savePhone(request.principal.subject, this.privacy.encryptPhone(phone)); return { phone: `${phone.slice(0, 3)}****${phone.slice(-4)}` }; }
  @Get('phone')
  async phone(@Req() request: UserRequest) { const value = await this.users.encryptedPhone(request.principal.subject); return { phone: value ? this.privacy.projectMaskedPhone(value, true) : null }; }
  @Post('deletion') deletion(@Req() request: UserRequest) { return this.users.requestDeletion(request.principal.subject); }
  @Delete('deletion') @HttpCode(HttpStatus.OK) async cancelDeletion(@Req() request: UserRequest) { await this.users.cancelDeletion(request.principal.subject); return { cancelled: true }; }
}
