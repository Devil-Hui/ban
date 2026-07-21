import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorCode } from '@scheduling/contracts';
import { buildErrorResponse } from './error-response.js';

const statusCodes: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'INVALID_ARGUMENT',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'PERMISSION_DENIED',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'VERSION_CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'DEPENDENCY_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.message : 'Internal server error';
    const code = statusCodes[status] ?? 'INTERNAL';
    reply.status(status).send(buildErrorResponse(code, raw, request.id));
  }
}
