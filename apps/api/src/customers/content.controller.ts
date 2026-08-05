import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 公用內容端點：提供前端顯示用的資料（不含敏感存證資訊）。
 * DisclaimerTemplate 由 SignatureCanvasStep 在顧客簽名前顯示全文，
 * 內容本身不做存證用（存證版本由後端在簽名時重新查詢並凍結進 contentSnapshot）。
 */
@Controller('content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('disclaimer-template')
  async getDisclaimerTemplate() {
    const template = await this.prisma.disclaimerTemplate.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { version: true, title: true, sections: true },
    });
    if (!template) {
      return { version: '', title: '外泌體免責聲明書', sections: [] };
    }
    return template;
  }
}
