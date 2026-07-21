import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UserAuthGuard } from '../auth/auth.guard.js';
import type { UserPrincipal } from '../auth/auth.types.js';
import { ScheduleService } from './schedule.service.js';

type UserRequest = FastifyRequest & { principal: UserPrincipal };
@Controller()
export class ShareController {
  constructor(@Inject(ScheduleService) private readonly schedules: ScheduleService) {}
  @Post('tasks/:taskId/versions/:versionId/shares') @UseGuards(UserAuthGuard)
  create(@Param('taskId') taskId: string, @Param('versionId') versionId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.createShare(request.principal.subject, taskId, versionId, Number(body?.expiresInHours)); }
  /** Collection-phase share mint (draft version under the hood). */
  @Post('tasks/:taskId/collection-shares') @UseGuards(UserAuthGuard)
  createCollection(@Param('taskId') taskId: string, @Body() body: any, @Req() request: UserRequest) {
    return this.schedules.createCollectionShare(request.principal.subject, taskId, Number(body?.expiresInHours), request.id);
  }
  @Delete('shares/:shareId') @UseGuards(UserAuthGuard)
  revoke(@Param('shareId') shareId: string, @Req() request: UserRequest) { return this.schedules.revokeShare(request.principal.subject, shareId); }
  @Get('public/shares/:token') public(@Param('token') token: string) { return this.schedules.publicShare(token); }
}
