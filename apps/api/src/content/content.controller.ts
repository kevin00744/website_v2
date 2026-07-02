import { Controller, Get, UseGuards } from '@nestjs/common';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/** 同意書條款內容只給「正在建檔/簽署同意書」的登入店務人員讀取，editor 等其他角色不需要也不應該看到 */
@Controller('content')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dealer', 'manager')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('disclaimer-template')
  getDisclaimerTemplate() {
    return this.contentService.getActiveDisclaimerTemplate();
  }
}
