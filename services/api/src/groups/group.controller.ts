import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UserAuthGuard } from '../auth/auth.guard.js';
import type { UserPrincipal } from '../auth/auth.types.js';
import { GroupService } from './group.service.js';

type AuthenticatedRequest = FastifyRequest & { principal: UserPrincipal };

function principal(request: AuthenticatedRequest): string {
  return request.principal.subject;
}

function text(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null || !(key in body) || typeof body[key as keyof object] !== 'string') return '';
  return String(body[key as keyof object]);
}

function bool(body: unknown, key: string): boolean {
  return typeof body === 'object' && body !== null && key in body && Boolean(body[key as keyof object]);
}

@Controller('groups')
@UseGuards(UserAuthGuard)
export class GroupController {
  constructor(@Inject(GroupService) private readonly groups: GroupService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.groups.listMine(principal(request));
  }

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const options: { description?: string; ownerDisplayName?: string } = {};
    const description = text(body, 'description');
    const ownerDisplayName = text(body, 'ownerDisplayName');
    if (description) options.description = description;
    if (ownerDisplayName) options.ownerDisplayName = ownerDisplayName;
    return this.groups.create(principal(request), text(body, 'name'), request.id, options);
  }

  @Get(':groupId')
  get(@Param('groupId') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groups.get(principal(request), groupId);
  }

  @Get(':groupId/members')
  members(@Param('groupId') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groups.members(principal(request), groupId);
  }

  @Post('join')
  join(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.groups.join(principal(request), text(body, 'inviteCode'), text(body, 'displayName'), request.id);
  }

  @Post(':groupId/leave')
  leave(@Param('groupId') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groups.leave(principal(request), groupId, request.id);
  }

  @Post(':groupId/members/:userId/kick')
  kick(@Param('groupId') groupId: string, @Param('userId') userId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.groups.kick(principal(request), groupId, userId, text(body, 'reason'), bool(body, 'blacklist'), request.id);
  }

  @Post(':groupId/members/:userId/unblock')
  unblock(@Param('groupId') groupId: string, @Param('userId') userId: string, @Req() request: AuthenticatedRequest) {
    return this.groups.unblock(principal(request), groupId, userId, request.id);
  }

  @Patch(':groupId/members/:userId/admin')
  setAdmin(@Param('groupId') groupId: string, @Param('userId') userId: string, @Req() request: AuthenticatedRequest) {
    return this.groups.setAdmin(principal(request), groupId, userId, request.id);
  }

  @Delete(':groupId/members/:userId/admin')
  removeAdmin(@Param('groupId') groupId: string, @Param('userId') userId: string, @Req() request: AuthenticatedRequest) {
    return this.groups.removeAdmin(principal(request), groupId, userId, request.id);
  }

  @Post(':groupId/transfer-ownership')
  transferOwnership(@Param('groupId') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.groups.transferOwnership(principal(request), groupId, text(body, 'targetUserId'), request.id);
  }

  @Delete(':groupId')
  dissolve(@Param('groupId') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groups.dissolve(principal(request), groupId, request.id);
  }
}
