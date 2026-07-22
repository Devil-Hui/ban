import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { GroupRepository } from '../groups/group.repository.js';
import { OutboxService } from '../notifications/outbox.service.js';
import { OcrScheduleController } from './ocr-schedule.controller.js';
import { ScheduleController } from './schedule.controller.js';
import { ScheduleRepository } from './schedule.repository.js';
import { ScheduleService } from './schedule.service.js';
import { ShareController } from './share.controller.js';

@Module({ controllers: [ScheduleController, ShareController, OcrScheduleController], providers: [AuditService, OutboxService, GroupRepository, ScheduleRepository, ScheduleService], exports: [ScheduleService, ScheduleRepository] })
export class SchedulingModule {}
