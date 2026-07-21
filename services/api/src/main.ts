import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { parseEnvironment } from './config/env.schema.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';

const env = parseEnvironment(process.env);
const adapter = new FastifyAdapter({
  logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
  genReqId: (request: IncomingMessage) => String(request.headers['x-request-id'] ?? randomUUID()),
});
adapter.getInstance().addHook('onRequest', async (request, reply) => {
  reply.header('x-request-id', request.id);
});

const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
app.useGlobalFilters(new ApiExceptionFilter());
app.setGlobalPrefix('api/v1', {
  exclude: [
    { path: 'health/live', method: RequestMethod.GET },
    { path: 'health/ready', method: RequestMethod.GET },
  ],
});
app.enableShutdownHooks();
await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
