import { Global, Module } from '@nestjs/common';
import { parseEnvironment } from '../config/env.schema.js';
import { PrivacyService } from './privacy.service.js';
import { UserRepository } from './user.repository.js';

@Global()
@Module({
  providers: [
    UserRepository,
    { provide: PrivacyService, useFactory: () => new PrivacyService(Buffer.from(parseEnvironment(process.env).PHONE_ENCRYPTION_KEY, 'hex')) },
  ],
  exports: [UserRepository, PrivacyService],
})
export class UsersModule {}
