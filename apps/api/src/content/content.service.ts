import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { DisclaimerSection } from '../customers/disclaimer-pdf.util';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 回傳目前生效中的免責聲明書條款，前端在進入簽署畫布前呼叫這支純粹是為了「顯示給顧客閱讀」。
   * 注意：實際簽署時真正用來產生 PDF/計算簽名錨點的內容，是後端在
   * CustomersService.createCustomerWithSignature 裡自己重新查一次 DisclaimerTemplate
   * 並凍結進 Signature.contentSnapshot，不是吃前端傳回來的這份資料——
   * 避免「顯示用的條款」跟「簽署當下實際生效的條款」之間出現信任邊界問題。
   */
  async getActiveDisclaimerTemplate(): Promise<{ version: string; title: string; sections: DisclaimerSection[] }> {
    const template = await this.prisma.disclaimerTemplate.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!template) {
      throw new AppError('DISCLAIMER_TEMPLATE_NOT_FOUND', 'no active disclaimer template', 404);
    }

    return {
      version: template.version,
      title: template.title,
      sections: template.sections as unknown as DisclaimerSection[],
    };
  }
}
