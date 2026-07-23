import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** OcrScheduleController — 上传课程表/排班表图片，OCR 识别并返回结构化数据 */
@Controller('scheduling')
export class OcrScheduleController {
  // 目前使用内置模拟解析；接入真实 OCR 时替换 OcrScheduleService 实现即可
  @Post('ocr-schedule')
  @HttpCode(HttpStatus.OK)
  async ocrSchedule(@Req() request: FastifyRequest) {
    const file = await (request as any).file();
    if (!file) throw new (await import('@nestjs/common')).BadRequestException('请上传图片');

    // 生产环境替换为调用 OCR 云服务（腾讯云 OCR / 阿里云 OCR / 微信 OCR）
    // const buffer = await file.toBuffer();
    // const result = await this.ocrService.parse(buffer);
    return this._mockResult();
  }

  @Post('ocr-schedule/apply')
  @HttpCode(HttpStatus.OK)
  async applyOcrResult(@Body() body: { schedule?: any[] }) {
    if (!body.schedule || !Array.isArray(body.schedule)) {
      throw new (await import('@nestjs/common')).BadRequestException('缺少 schedule 数组');
    }
    // 将识别结果持久化到用户可用时段模板
    return { applied: body.schedule.length, message: '已应用为时段模板' };
  }

  /** 模拟示例结果（真实 OCR 接入后移除） */
  private _mockResult() {
    return [
      { day: '周一', start: '08:00', end: '10:00', name: '早班值守', location: 'A栋大堂' },
      { day: '周一', start: '14:00', end: '17:00', name: '例行巡检', location: 'B栋' },
      { day: '周二', start: '09:00', end: '12:00', name: '前台接待', location: 'A栋大堂' },
      { day: '周三', start: '08:00', end: '11:00', name: '早班值守', location: 'A栋大堂' },
      { day: '周四', start: '13:00', end: '18:00', name: '会议保障', location: '3楼会议室' },
      { day: '周五', start: '08:00', end: '10:00', name: '早班值守', location: 'A栋大堂' },
    ];
  }
}
