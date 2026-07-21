import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminAuthGuard } from '../auth/auth.guard.js';
import type { AdminPrincipal } from '../auth/auth.types.js';
import { AdminOperationsService } from './admin-operations.service.js';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminOperationsController {
  constructor(@Inject(AdminOperationsService) private readonly operations: AdminOperationsService) {}
  @Get('overview') overview() { return this.operations.overview(); }
  @Get('users') users(@Query('limit') limit?: string) { return this.operations.users(Number(limit) || 50); }
  @Get('groups') groups(@Query('limit') limit?: string) { return this.operations.groups(Number(limit) || 50); }
  @Get('tasks') tasks(@Query('limit') limit?: string) { return this.operations.tasks(Number(limit) || 50); }
  @Get('audit') audit(@Query('limit') limit?: string) { return this.operations.audit(Number(limit) || 50); }
  @Get('accounts') accounts(@Query('limit') limit?: string) { return this.operations.admins(Number(limit) || 50); }
  @Get('notifications') notifications(@Query('limit') limit?: string) { return this.operations.notifications(Number(limit) || 50); }
  @Get('solver-jobs') solverJobs(@Query('limit') limit?: string) { return this.operations.solverJobs(Number(limit) || 50); }
  @Get('templates') templates(@Query('limit') limit?: string) { return this.operations.templates(Number(limit) || 50); }
  @Get('system') system() { return this.operations.system(); }
  @Post('notifications/:notificationId/retry') retryNotification(@Param('notificationId') notificationId: string, @Req() request: FastifyRequest & { principal: AdminPrincipal }) { return this.operations.retryNotification(request.principal.subject, notificationId, request.id); }
  @Patch('users/:userId/status') setUserStatus(@Param('userId') userId: string, @Body() body: any, @Req() request: FastifyRequest & { principal: AdminPrincipal }) { const status = body?.status === 'active' ? 'active' : body?.status === 'banned' ? 'banned' : null; if (!status) throw new ForbiddenException('Invalid user status'); return this.operations.setUserStatus(request.principal.subject, userId, status, request.id); }
  @Post('accounts') createAdmin(@Body() body: any, @Req() request: FastifyRequest & { principal: AdminPrincipal }) { if (request.principal.role !== 'superadmin') throw new ForbiddenException('Superadmin required'); const role = body?.role === 'superadmin' ? 'superadmin' : 'admin'; return this.operations.createAdmin(request.principal.subject, String(body?.username ?? ''), String(body?.password ?? ''), role, request.id); }
}
