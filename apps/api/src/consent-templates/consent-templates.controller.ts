import { Body, Controller, Get, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ConsentTemplatesService, type ConsentTemplateInput } from './consent-templates.service';

/**
 * 同意書管理：只有 admin / system_admin（RolesGuard 超集放行 + service 再檢查一次）。
 * 簽署流程（GET /content/disclaimer-template、簽名時查範本）一律取「使用中」的版本，不用改。
 */
@Controller('consent-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ConsentTemplatesController {
  constructor(private readonly service: ConsentTemplatesService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.list(actor);
  }

  /** 草稿預覽（不寫入）。必須放在 :id 路由之前 */
  @Post('preview')
  async previewDraft(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ConsentTemplateInput, @Res() res: Response) {
    const buffer = await this.service.previewDraft(actor, dto);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="consent-preview.pdf"' });
    res.send(buffer);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(actor, id);
  }

  @Get(':id/preview')
  async previewSaved(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.service.previewSaved(actor, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="consent-template.pdf"' });
    res.send(buffer);
  }

  /** 存成新版本並設為使用中 */
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ConsentTemplateInput) {
    return this.service.create(actor, dto);
  }

  @Post(':id/activate')
  activate(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.activate(actor, id);
  }
}
