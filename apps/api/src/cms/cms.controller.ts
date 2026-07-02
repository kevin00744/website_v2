import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  CmsService,
  type CreateArticleInput,
  type CreatePageInput,
  type CreateTemplateInput,
  type ListPublishedArticlesQuery,
  type UpdateArticleInput,
  type UpdatePageInput,
  type UpdateTemplateInput,
} from './cms.service';
import { mimeTypeForCmsUpload } from './cms-upload.util';
import { AppError } from '../common/errors/app-error';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * 同一個 controller 裡混兩種訪客：/pages/:slug 跟 /uploads/:fileName 是前台用的公開端點，完全不掛 guard；
 * /admin/* 是後台編輯用，各自掛 JwtAuthGuard+RolesGuard（main.ts 沒有全域套用 guard，
 * 所以這種「同 controller、部分路由公開」的寫法可以直接成立，不需要拆成兩個 controller）。
 */
@Controller('cms')
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  /** 前台 Next.js 渲染頁面用，完全公開、不需要登入；只回已發布的版本 */
  @Get('pages/:slug')
  getPublishedPage(@Param('slug') slug: string) {
    return this.cmsService.getPublishedPageBySlug(slug);
  }

  /** 前台首頁（"/"）用：哪個頁面是首頁由後台設定決定，這支故意放在 'pages/:slug' 之前避免路由衝突（這裡是固定字串，不會衝突，純粹放這裡語意上跟其他公開頁面端點放一起） */
  @Get('homepage')
  getHomepage() {
    return this.cmsService.getHomepage();
  }

  /** 前台導覽列用，完全公開、不需要登入 */
  @Get('nav-pages')
  listNavPages() {
    return this.cmsService.listNavPages();
  }

  /** 站內搜尋，完全公開、不需要登入；q 是搜尋關鍵字。範圍限定在常見問題（文章）內容，見 searchArticles() 的說明 */
  @Get('search')
  search(@Query('q') q: string) {
    return this.cmsService.searchArticles(q ?? '');
  }

  /**
   * 圖片素材本身完全公開（官網頁面要顯示給所有訪客看），所以這支故意不掛任何 guard——
   * 上傳那一步才需要權限管控，已經存在磁碟上的圖片沒有理由擋下載。
   */
  @Get('uploads/:fileName')
  async getUpload(@Param('fileName') fileName: string, @Res() res: Response) {
    const buffer = await this.cmsService.loadUpload(fileName);
    res.set({
      'Content-Type': mimeTypeForCmsUpload(fileName),
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.send(buffer);
  }

  /** @Roles('admin') 已足夠：system_admin 透過 RolesGuard 的 isAdminRole 超集自動放行 */
  @Get('admin/pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  listPages() {
    return this.cmsService.listPages();
  }

  @Post('admin/pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createPage(@Body() dto: CreatePageInput) {
    return this.cmsService.createPage(dto);
  }

  /** 給編輯器載入用：跟 GET /pages/:slug 不同，這支不篩 isPublished，草稿也讀得到 */
  @Get('admin/pages/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getPageForAdmin(@Param('slug') slug: string) {
    return this.cmsService.getPageBySlugForAdmin(slug);
  }

  @Put('admin/pages/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updatePage(@Param('slug') slug: string, @Body() dto: UpdatePageInput) {
    return this.cmsService.updatePageBySlug(slug, dto);
  }

  @Delete('admin/pages/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deletePage(@Param('slug') slug: string) {
    return this.cmsService.deletePage(slug);
  }

  /** Puck 編輯器裡的圖片欄位用這支上傳，回傳的相對路徑直接存進區塊的 imageUrl props */
  @Post('admin/uploads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new AppError('CMS_UPLOAD_MISSING', 'no file uploaded', 400);
    }
    return this.cmsService.saveUpload(file.originalname, file.buffer);
  }

  @Get('admin/templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  listTemplates() {
    return this.cmsService.listTemplates();
  }

  @Post('admin/templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createTemplate(@Body() dto: CreateTemplateInput) {
    return this.cmsService.createTemplate(dto);
  }

  @Get('admin/templates/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.cmsService.getTemplateById(id);
  }

  @Put('admin/templates/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateInput) {
    return this.cmsService.updateTemplate(id, dto);
  }

  @Delete('admin/templates/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.cmsService.deleteTemplate(id);
  }

  /** 前台文章列表（最新消息頁、ArticleList 區塊都打這支），search 是站內搜尋的查詢字串，選填；categoryPageId 篩「放在哪個頁面底下」 */
  @Get('articles')
  listPublishedArticles(@Query() query: ListPublishedArticlesQuery) {
    return this.cmsService.listPublishedArticles({
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      categoryPageId: query.categoryPageId ? Number(query.categoryPageId) : undefined,
    });
  }

  /** 文章設定畫面「放在哪一個頁面底下」的下拉選單用 */
  @Get('admin/page-options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  listPageOptions() {
    return this.cmsService.listPageOptions();
  }

  @Get('articles/:slug')
  getPublishedArticle(@Param('slug') slug: string) {
    return this.cmsService.getPublishedArticleBySlug(slug);
  }

  @Get('admin/articles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  listArticlesForAdmin() {
    return this.cmsService.listArticlesForAdmin();
  }

  @Post('admin/articles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createArticle(@Body() dto: CreateArticleInput) {
    return this.cmsService.createArticle(dto);
  }

  @Get('admin/articles/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getArticleForAdmin(@Param('slug') slug: string) {
    return this.cmsService.getArticleBySlugForAdmin(slug);
  }

  @Put('admin/articles/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateArticle(@Param('slug') slug: string, @Body() dto: UpdateArticleInput) {
    return this.cmsService.updateArticleBySlug(slug, dto);
  }

  @Delete('admin/articles/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  deleteArticle(@Param('slug') slug: string) {
    return this.cmsService.deleteArticle(slug);
  }
}
