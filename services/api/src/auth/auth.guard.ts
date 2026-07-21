import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Principal } from './auth.types.js';
import { TokenService } from './token.service.js';

type PrincipalRequest = FastifyRequest & { principal?: Principal };

function bearer(request: FastifyRequest): string {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');
  return value.slice('Bearer '.length).trim();
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    try {
      request.principal = await this.tokens.verifyAccess(bearer(request), 'user');
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    try {
      request.principal = await this.tokens.verifyAccess(bearer(request), 'admin');
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }
}
