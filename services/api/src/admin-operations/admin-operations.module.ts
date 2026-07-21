import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { AdminOperationsController } from './admin-operations.controller.js';
import { AdminOperationsService } from './admin-operations.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminSessionRepository } from '../admin-auth/admin-session.repository.js';

@Module({ imports: [AdminAuthModule], controllers: [AdminOperationsController], providers: [AuditService, AdminSessionRepository, AdminOperationsService], exports: [AdminOperationsService] })
export class AdminOperationsModule {}
