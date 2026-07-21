import { Global, Module } from '@nestjs/common';
import { parseEnvironment } from '../config/env.schema.js';
import { AdminAuthGuard, UserAuthGuard } from './auth.guard.js';
import { AuthController } from './auth.controller.js';
import { TokenService } from './token.service.js';
import { UserAuthService } from './user-auth.service.js';
import { WechatLoginAdapter } from './wechat-login.adapter.js';
import { UsersModule } from '../users/users.module.js';
import { PrivacyController } from '../users/privacy.controller.js';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController, PrivacyController],
  providers: [
    { provide: TokenService, useFactory: () => new TokenService(parseEnvironment(process.env).TOKEN_SIGNING_SECRET) },
    UserAuthGuard,
    AdminAuthGuard,
    WechatLoginAdapter,
    UserAuthService,
  ],
  exports: [TokenService, UserAuthGuard, AdminAuthGuard],
})
export class AuthModule {}
