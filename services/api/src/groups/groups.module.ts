import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { GroupController } from './group.controller.js';
import { GroupRepository } from './group.repository.js';
import { GroupService } from './group.service.js';

@Module({
  controllers: [GroupController],
  providers: [AuditService, GroupRepository, GroupService],
  exports: [GroupService, GroupRepository],
})
export class GroupsModule {}
