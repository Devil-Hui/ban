import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { parseEnvironment } from '../config/env.schema.js';
import { AdminAuthService } from './admin-auth.service.js';

const env = parseEnvironment(process.env);
if (!env.ADMIN_BOOTSTRAP_USERNAME || !env.ADMIN_BOOTSTRAP_PASSWORD) throw new Error('admin bootstrap credentials must be supplied by the environment');
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  await app.get(AdminAuthService).bootstrap(env.ADMIN_BOOTSTRAP_USERNAME, env.ADMIN_BOOTSTRAP_PASSWORD);
  console.log('admin-bootstrap=ok');
} finally {
  await app.close();
}
