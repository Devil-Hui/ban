import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    try {
      return await this.health.ready();
    } catch {
      throw new ServiceUnavailableException('Dependencies are not ready');
    }
  }
}
