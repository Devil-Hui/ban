import { Global, Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminSessionRepository } from './admin-session.repository.js';
import { AdminMfaService } from './admin-mfa.service.js';

@Global()
@Module({
  controllers: [AdminAuthController],
  providers: [AdminSessionRepository, AdminMfaService, AdminAuthService],
  exports: [AdminAuthService, AdminSessionRepository, AdminMfaService],
})
export class AdminAuthModule {}
