import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** 独立预填写可用时间（不依赖排班任务） */
@Controller('users')
export class UserAvailabilityController {
  // 内存存储（开发环境）；生产换成 DB 表
  private store = new Map<string, any[][]>();

  @Get('me/availability')
  getMyAvailability(@Req() request: FastifyRequest) {
    const userId = (request as any).userId || 'unknown';
    return this.store.get(userId) || [];
  }

  @Post('me/availability')
  @HttpCode(HttpStatus.OK)
  saveMyAvailability(@Body() body: { rows?: any[][] }, @Req() request: FastifyRequest) {
    const userId = (request as any).userId || 'unknown';
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    this.store.set(userId, rows);
    return { saved: rows.length, message: '预填写已保存' };
  }
}
