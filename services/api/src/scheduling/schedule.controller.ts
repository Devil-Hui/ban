import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UserAuthGuard } from '../auth/auth.guard.js';
import type { UserPrincipal } from '../auth/auth.types.js';
import { ScheduleService } from './schedule.service.js';

type UserRequest = FastifyRequest & { principal: UserPrincipal };
const actor = (request: UserRequest) => request.principal.subject;

@Controller()
@UseGuards(UserAuthGuard)
export class ScheduleController {
  constructor(@Inject(ScheduleService) private readonly schedules: ScheduleService) {}
  @Post('groups/:groupId/tasks') create(@Param('groupId') groupId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.createTask(actor(request), groupId, body ?? {}, request.id); }
  @Get('groups/:groupId/tasks') list(@Param('groupId') groupId: string, @Req() request: UserRequest) { return this.schedules.listTasks(actor(request), groupId); }
  @Post('groups/:groupId/templates') createTemplate(@Param('groupId') groupId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.createTemplate(actor(request), groupId, body ?? {}, request.id); }
  @Get('groups/:groupId/templates') listTemplates(@Param('groupId') groupId: string, @Req() request: UserRequest) { return this.schedules.listTemplates(actor(request), groupId); }
  /** Campus-wide period presets for task-create (DB-backed, not client hardcode). */
  @Get('catalog/campus-schedule-presets') listCampusPresets(@Req() request: UserRequest) {
    return this.schedules.listCampusSchedulePresets(actor(request));
  }
  /** Full task-create / label catalog from DB. */
  @Get('catalog/task-create') taskCreateCatalog(@Req() request: UserRequest) {
    return this.schedules.taskCreateCatalog(actor(request));
  }
  @Get('catalog/options') listOptions(@Req() request: UserRequest) {
    return this.schedules.listOptionCatalog(actor(request));
  }
  @Get('tasks/:taskId') get(@Param('taskId') taskId: string, @Query('shareToken') shareToken: string | undefined, @Req() request: UserRequest) { return this.schedules.getTask(actor(request), taskId, shareToken?.trim() || undefined); }
  @Get('tasks/:taskId/collection') collection(@Param('taskId') taskId: string, @Req() request: UserRequest) { return this.schedules.collectionSummary(actor(request), taskId); }
  @Post('tasks/:taskId/availability') availability(
    @Param('taskId') taskId: string,
    @Body() body: any,
    @Headers('x-share-token') shareTokenHeader: string | undefined,
    @Req() request: UserRequest,
  ) {
    const shareToken = typeof body?.shareToken === 'string' && body.shareToken.trim()
      ? body.shareToken.trim()
      : (typeof shareTokenHeader === 'string' ? shareTokenHeader.trim() : undefined);
    const profile = body?.profile && typeof body.profile === 'object'
      ? body.profile
      : {
          ...(typeof body?.name === 'string' ? { name: body.name } : {}),
          ...(typeof body?.studentId === 'string' ? { studentId: body.studentId } : {}),
          ...(typeof body?.phone === 'string' ? { phone: body.phone } : {}),
        };
    return this.schedules.submitAvailability(actor(request), taskId, body?.entries, request.id, shareToken || undefined, profile);
  }
  @Post('tasks/:taskId/close-collection') close(@Param('taskId') taskId: string, @Req() request: UserRequest) { return this.schedules.closeCollection(actor(request), taskId, request.id); }
  @Post('tasks/:taskId/reopen') reopen(@Param('taskId') taskId: string, @Req() request: UserRequest) { return this.schedules.reopen(actor(request), taskId, request.id); }
  @Post('tasks/:taskId/extend-deadline') extend(@Param('taskId') taskId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.extendDeadline(actor(request), taskId, String(body?.deadline ?? ''), request.id); }
  @Get('tasks/:taskId/availability/me') mine(@Param('taskId') taskId: string, @Query('shareToken') shareToken: string | undefined, @Req() request: UserRequest) { return this.schedules.myAvailability(actor(request), taskId, shareToken?.trim() || undefined); }
  /** Read-only, membership-optional landing context for the availability page. */
  @Get('tasks/:taskId/landing-context')
  landingContext(@Param('taskId') taskId: string, @Query('shareToken') shareToken: string | undefined, @Req() request: UserRequest) {
    return this.schedules.landingContext(actor(request), taskId, shareToken?.trim() || undefined);
  }
  @Get('tasks/:taskId/availability-board') availabilityBoard(@Param('taskId') taskId: string, @Req() request: UserRequest) {
    return this.schedules.availabilityBoard(actor(request), taskId);
  }
  @Get('tasks/:taskId/fixed-assignments') fixedAssignments(@Param('taskId') taskId: string, @Req() request: UserRequest) { return this.schedules.fixedAssignments(actor(request), taskId); }
  @Patch('tasks/:taskId/fixed-assignments') replaceFixedAssignments(@Param('taskId') taskId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.replaceFixedAssignments(actor(request), taskId, body?.assignments, request.id); }
  @Post('tasks/:taskId/solve') solve(@Param('taskId') taskId: string, @Headers('idempotency-key') key: string, @Req() request: UserRequest) { return this.schedules.requestSolve(actor(request), taskId, key, request.id); }
  @Get('tasks/:taskId/solve/:jobId') job(@Param('taskId') taskId: string, @Param('jobId') jobId: string, @Req() request: UserRequest) { return this.schedules.getJob(actor(request), taskId, jobId); }
  @Get('tasks/:taskId/solve/:jobId/candidates') candidates(@Param('taskId') taskId: string, @Param('jobId') jobId: string, @Req() request: UserRequest) { return this.schedules.candidates(actor(request), taskId, jobId); }
  @Post('tasks/:taskId/publish') publish(@Param('taskId') taskId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.publish(actor(request), taskId, body?.assignments, request.id); }
  @Get('tasks/:taskId/schedule') published(@Param('taskId') taskId: string, @Req() request: UserRequest) { return this.schedules.published(actor(request), taskId); }
  @Get('users/me/schedule') personal(@Req() request: UserRequest) { return this.schedules.personalPublishedSchedule(actor(request)); }
  @Post('tasks/:taskId/versions/:versionId/receipt') receipt(@Param('taskId') taskId: string, @Param('versionId') versionId: string, @Req() request: UserRequest) { return this.schedules.receipt(actor(request), taskId, versionId); }
  @Post('tasks/:taskId/versions/:versionId/objections') objection(@Param('taskId') taskId: string, @Param('versionId') versionId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.objection(actor(request), taskId, versionId, body?.slotId ?? null, String(body?.reason ?? ''), request.id); }
  @Get('tasks/:taskId/versions/:versionId/objections') objections(@Param('taskId') taskId: string, @Param('versionId') versionId: string, @Req() request: UserRequest) { return this.schedules.listObjections(actor(request), taskId, versionId); }
  @Patch('tasks/:taskId/versions/:versionId/objections/:objectionId') resolveObjection(@Param('taskId') taskId: string, @Param('versionId') versionId: string, @Param('objectionId') objectionId: string, @Body() body: any, @Req() request: UserRequest) { return this.schedules.resolveObjection(actor(request), taskId, versionId, objectionId, String(body?.status ?? ''), String(body?.note ?? ''), request.id); }
}
