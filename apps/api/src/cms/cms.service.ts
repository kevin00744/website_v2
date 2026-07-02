import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { generateCmsUploadFileName, loadCmsUpload, saveCmsUpload } from './cms-upload.util';

export interface CreatePageInput {
  slug: string;
  title: string;
  metaDescription?: string;
  content?: unknown;
  isPublished?: boolean;
  isHomepage?: boolean;
  showInNav?: boolean;
  navOrder?: number;
}

export interface UpdatePageInput {
  title?: string;
  metaDescription?: string;
  content?: unknown;
  isPublished?: boolean;
  isHomepage?: boolean;
  showInNav?: boolean;
  navOrder?: number;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  content?: unknown;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  content?: unknown;
}

export interface CreateArticleInput {
  slug: string;
  title: string;
  excerpt?: string;
  coverImageUrl?: string;
  content?: unknown;
  isPublished?: boolean;
  categoryPageId?: number | null;
}

export interface UpdateArticleInput {
  title?: string;
  excerpt?: string;
  coverImageUrl?: string;
  content?: unknown;
  isPublished?: boolean;
  categoryPageId?: number | null;
}

export interface ListPublishedArticlesQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  categoryPageId?: number;
}

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 前台 Next.js 渲染頁面用：只回已發布的版本，未發布（草稿中）一律當作不存在，
   * 不會讓還在編輯中的內容意外曝光到公開網站——這跟後台「先存草稿、確認沒問題才按發布」的
   * 編輯流程是一體的，不是另外用權限擋，是直接用 isPublished 篩掉。
   */
  async getPublishedPageBySlug(slug: string) {
    const page = await this.prisma.page.findFirst({ where: { slug, isPublished: true } });
    if (!page) {
      throw new AppError('CMS_PAGE_NOT_FOUND', `published page "${slug}" not found`, 404);
    }
    return {
      slug: page.slug,
      title: page.title,
      metaDescription: page.metaDescription,
      content: page.content,
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  /**
   * 給後台「編輯內容」畫面載入用：跟 getPublishedPageBySlug 不同，這支不篩 isPublished——
   * 草稿（還沒發布）也要能打開來編輯，不能因為還沒發布就讀不到，否則永遠沒辦法把第一版內容做完。
   */
  async getPageBySlugForAdmin(slug: string) {
    const page = await this.prisma.page.findUnique({ where: { slug } });
    if (!page) {
      throw new AppError('CMS_PAGE_NOT_FOUND', `page "${slug}" not found`, 404);
    }
    return { ...page, createdAt: page.createdAt.toISOString(), updatedAt: page.updatedAt.toISOString() };
  }

  /** 後台頁面清單只回摘要欄位（不含完整 content），跟既有 CustomerListItem 的「列表輕、細節重」原則一致 */
  async listPages() {
    const pages = await this.prisma.page.findMany({
      select: { id: true, slug: true, title: true, isPublished: true, isHomepage: true, showInNav: true, navOrder: true, updatedAt: true },
      orderBy: [{ navOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    return pages.map((page) => ({ ...page, updatedAt: page.updatedAt.toISOString() }));
  }

  /**
   * 前台首頁（"/"）用：哪一個頁面是首頁完全由後台設定決定，不是寫死 slug === 'home'——
   * 管理員可以隨時把任何已發布的頁面切換成首頁。同一時間只會有一個 isHomepage = true
   * 的頁面（見 setHomepage），這裡只是單純查那一筆。
   */
  async getHomepage() {
    const page = await this.prisma.page.findFirst({ where: { isHomepage: true, isPublished: true } });
    if (!page) {
      throw new AppError('CMS_PAGE_NOT_FOUND', 'no page is set as homepage', 404);
    }
    return {
      slug: page.slug,
      title: page.title,
      metaDescription: page.metaDescription,
      content: page.content,
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  /** 前台導覽列用：只列已發布、showInNav=true 的頁面，依 navOrder 排序——這支故意不需要登入 */
  async listNavPages() {
    const pages = await this.prisma.page.findMany({
      where: { isPublished: true, showInNav: true },
      select: { slug: true, title: true, navOrder: true },
      orderBy: [{ navOrder: 'asc' }, { id: 'asc' }],
    });
    return pages;
  }

  async createPage(input: CreatePageInput) {
    const existing = await this.prisma.page.findUnique({ where: { slug: input.slug } });
    if (existing) {
      throw new AppError('CMS_SLUG_EXISTS', `slug "${input.slug}" already exists`, 409);
    }

    const page = await this.prisma.$transaction(async (tx) => {
      if (input.isHomepage) {
        await tx.page.updateMany({ where: { isHomepage: true }, data: { isHomepage: false } });
      }
      return tx.page.create({
        data: {
          slug: input.slug,
          title: input.title,
          metaDescription: input.metaDescription,
          content: (input.content ?? {}) as Prisma.InputJsonValue,
          isPublished: input.isPublished ?? false,
          isHomepage: input.isHomepage ?? false,
          showInNav: input.showInNav ?? true,
          navOrder: input.navOrder ?? 0,
        },
      });
    });
    return { ...page, updatedAt: page.updatedAt.toISOString() };
  }

  /**
   * 用 slug 而不是 id 當更新的識別碼——拖拉編輯器存檔時就是「對著目前正在編輯的這個 slug 存」，不需要額外帶 id。
   * isHomepage 切成 true 時，用 transaction 把舊的首頁先取消掉，保證全站永遠最多只有一個首頁。
   */
  async updatePageBySlug(slug: string, input: UpdatePageInput) {
    const existing = await this.prisma.page.findUnique({ where: { slug } });
    if (!existing) {
      throw new AppError('CMS_PAGE_NOT_FOUND', `page "${slug}" not found`, 404);
    }

    const page = await this.prisma.$transaction(async (tx) => {
      if (input.isHomepage === true) {
        await tx.page.updateMany({ where: { isHomepage: true, slug: { not: slug } }, data: { isHomepage: false } });
      }
      return tx.page.update({
        where: { slug },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription } : {}),
          ...(input.content !== undefined ? { content: input.content as Prisma.InputJsonValue } : {}),
          ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
          ...(input.isHomepage !== undefined ? { isHomepage: input.isHomepage } : {}),
          ...(input.showInNav !== undefined ? { showInNav: input.showInNav } : {}),
          ...(input.navOrder !== undefined ? { navOrder: input.navOrder } : {}),
        },
      });
    });
    return { ...page, updatedAt: page.updatedAt.toISOString() };
  }

  /**
   * 刪除頁面：跟 deleteTemplate/deleteArticle 一樣是硬刪除（Page 沒有 deletedAt 欄位，不走軟刪除）。
   * 文章的 categoryPageId 設了 onDelete: SetNull，刪頁面不會連帶刪掉底下分類的文章，只是把
   * 那些文章的分類清空——文章本身是獨立存在的內容單位，不該因為分類頁面被刪就整篇消失。
   */
  async deletePage(slug: string) {
    const existing = await this.prisma.page.findUnique({ where: { slug } });
    if (!existing) {
      throw new AppError('CMS_PAGE_NOT_FOUND', `page "${slug}" not found`, 404);
    }
    await this.prisma.page.delete({ where: { slug } });
  }

  /**
   * 圖片上傳：檔案內容存到本機磁碟（cms-upload.util.ts），回傳的是「相對路徑」而不是完整網址——
   * 跟既有 getDisclaimerPdfPath() 的慣例一致，前端自己組合 API_BASE_URL 變成瀏覽器能直接載入的網址。
   * 跟顧客文件不同，這裡刻意不掛權限在「下載」這一步（見 CmsController 的 GET /uploads/:fileName 沒有 guard）——
   * 這些圖片本來就是要被公開頁面顯示的素材，擋下載權限沒有意義，上傳這一步才需要 admin 權限。
   */
  async saveUpload(originalName: string, buffer: Buffer): Promise<{ url: string }> {
    const fileName = generateCmsUploadFileName(originalName);
    await saveCmsUpload(fileName, buffer);
    return { url: `/cms/uploads/${fileName}` };
  }

  async loadUpload(fileName: string): Promise<Buffer> {
    try {
      return await loadCmsUpload(fileName);
    } catch {
      throw new AppError('CMS_UPLOAD_NOT_FOUND', `upload "${fileName}" not found`, 404);
    }
  }

  /** 範本庫：admin/system_admin 可以把編輯好的一組區塊存成可重複套用的範本，跟單一頁面的 content 是同一種 JSON 結構 */
  async listTemplates() {
    const templates = await this.prisma.pageTemplate.findMany({
      select: { id: true, name: true, description: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return templates.map((template) => ({ ...template, updatedAt: template.updatedAt.toISOString() }));
  }

  async getTemplateById(id: number) {
    const template = await this.prisma.pageTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new AppError('CMS_TEMPLATE_NOT_FOUND', `template ${id} not found`, 404);
    }
    return { ...template, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString() };
  }

  async createTemplate(input: CreateTemplateInput) {
    const template = await this.prisma.pageTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        content: (input.content ?? {}) as Prisma.InputJsonValue,
      },
    });
    return { ...template, updatedAt: template.updatedAt.toISOString() };
  }

  async updateTemplate(id: number, input: UpdateTemplateInput) {
    const existing = await this.prisma.pageTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('CMS_TEMPLATE_NOT_FOUND', `template ${id} not found`, 404);
    }

    const template = await this.prisma.pageTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.content !== undefined ? { content: input.content as Prisma.InputJsonValue } : {}),
      },
    });
    return { ...template, updatedAt: template.updatedAt.toISOString() };
  }

  async deleteTemplate(id: number) {
    const existing = await this.prisma.pageTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('CMS_TEMPLATE_NOT_FOUND', `template ${id} not found`, 404);
    }
    await this.prisma.pageTemplate.delete({ where: { id } });
  }

  /**
   * 文章列表（前台公開用）：只回已發布的，依 publishedAt 新到舊排序——這是「內容堆疊」功能的核心查詢，
   * 任何頁面的 ArticleList 區塊都是呼叫這支。search 先用最簡單的 ILIKE 比對標題/摘要，
   * 之後要做更進階的站內搜尋（多欄位加權、中文分詞等）時，可以直接在這支裡面換成
   * Postgres tsvector/外部搜尋服務，呼叫端（區塊/前台頁面）完全不用改。
   */
  async listPublishedArticles(query: ListPublishedArticlesQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 50) : 10;
    const search = query.search?.trim();

    const where: Prisma.ArticleWhereInput = {
      isPublished: true,
      ...(query.categoryPageId ? { categoryPageId: query.categoryPageId } : {}),
    };

    if (search) {
      // content 是 Json，Prisma 的 contains 比對不到，跟 CmsService.searchPages() 同樣的理由用
      // $queryRaw 先找出符合「標題／摘要／內容」關鍵字的文章 id，再丟回一般 Prisma 查詢套用
      // 其他篩選條件（categoryPageId）跟分頁——這樣站內搜尋才會連文章正文都搜得到，不是只搜標題/摘要。
      const pattern = `%${search}%`;
      const matched = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM articles
        WHERE is_published = true
          AND (title ILIKE ${pattern} OR excerpt ILIKE ${pattern} OR content::text ILIKE ${pattern})
      `;
      where.id = { in: matched.map((row) => row.id) };
    }

    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        select: { slug: true, title: true, excerpt: true, coverImageUrl: true, publishedAt: true, categoryPageId: true, categoryPage: { select: { title: true } } },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.article.count({ where }),
    ]);

    return {
      items: articles.map(({ categoryPage, ...article }) => ({
        ...article,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        categoryPageTitle: categoryPage?.title ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 前台文章詳情頁用：跟頁面一樣，只回已發布版本，草稿一律視為不存在 */
  async getPublishedArticleBySlug(slug: string) {
    const article = await this.prisma.article.findFirst({ where: { slug, isPublished: true } });
    if (!article) {
      throw new AppError('CMS_ARTICLE_NOT_FOUND', `published article "${slug}" not found`, 404);
    }
    return { ...article, publishedAt: article.publishedAt?.toISOString() ?? null, updatedAt: article.updatedAt.toISOString() };
  }

  /** 後台文章清單：不篩 isPublished，草稿也要列出來讓管理員可以接著編輯；連帶帶出分類頁面的標題方便顯示 */
  async listArticlesForAdmin() {
    const articles = await this.prisma.article.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        coverImageUrl: true,
        isPublished: true,
        updatedAt: true,
        categoryPageId: true,
        categoryPage: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return articles.map(({ categoryPage, ...article }) => ({
      ...article,
      updatedAt: article.updatedAt.toISOString(),
      categoryPageTitle: categoryPage?.title ?? null,
    }));
  }

  /** 給文章設定畫面的「放在哪一個頁面底下」下拉選單用：列出所有頁面（不限發布狀態） */
  async listPageOptions() {
    return this.prisma.page.findMany({ select: { id: true, title: true, slug: true }, orderBy: { title: 'asc' } });
  }

  /**
   * 站內搜尋：範圍限定在「常見問題」（Article 表）——對標題、摘要、內容（content）做關鍵字
   * 模糊比對，只回已發布的文章。原本這支是搜 Page 表，但常見問題改成顯示所有文章後
   * （ArticleList/FaqList 共用同一份資料），首頁右上角的搜尋框就該對齊「搜常見問題」的
   * 使用情境，改成搜 Article 表，搜尋結果連到文章詳情頁（/news/{slug}）。
   * content 是 Json 欄位，Prisma 的 `contains` filter 不支援對 Json 欄位做文字搜尋，所以用
   * $queryRaw 把 content 轉成文字（::text）再用 ILIKE 比對。
   */
  async searchArticles(query: string) {
    const keyword = query.trim();
    if (!keyword) {
      return [];
    }
    const pattern = `%${keyword}%`;
    const rows = await this.prisma.$queryRaw<{ slug: string; title: string; excerpt: string | null }[]>`
      SELECT slug, title, excerpt
      FROM articles
      WHERE is_published = true
        AND (title ILIKE ${pattern} OR excerpt ILIKE ${pattern} OR content::text ILIKE ${pattern})
      ORDER BY published_at DESC
      LIMIT 30
    `;
    return rows.map((row) => ({ slug: row.slug, title: row.title, excerpt: row.excerpt }));
  }

  async getArticleBySlugForAdmin(slug: string) {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) {
      throw new AppError('CMS_ARTICLE_NOT_FOUND', `article "${slug}" not found`, 404);
    }
    return { ...article, publishedAt: article.publishedAt?.toISOString() ?? null, createdAt: article.createdAt.toISOString(), updatedAt: article.updatedAt.toISOString() };
  }

  async createArticle(input: CreateArticleInput) {
    const existing = await this.prisma.article.findUnique({ where: { slug: input.slug } });
    if (existing) {
      throw new AppError('CMS_SLUG_EXISTS', `slug "${input.slug}" already exists`, 409);
    }

    const isPublished = input.isPublished ?? false;
    const article = await this.prisma.article.create({
      data: {
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        coverImageUrl: input.coverImageUrl,
        content: (input.content ?? {}) as Prisma.InputJsonValue,
        isPublished,
        publishedAt: isPublished ? new Date() : null,
        categoryPageId: input.categoryPageId ?? null,
      },
    });
    return { ...article, publishedAt: article.publishedAt?.toISOString() ?? null, updatedAt: article.updatedAt.toISOString() };
  }

  /**
   * 第一次把草稿切成「已發布」時補上 publishedAt（之後重複按發布/取消發布不會再變動這個時間），
   * 這樣文章列表的排序時間軸才會穩定，不會因為小幅修訂內容就整篇文章往前跳。
   */
  async updateArticleBySlug(slug: string, input: UpdateArticleInput) {
    const existing = await this.prisma.article.findUnique({ where: { slug } });
    if (!existing) {
      throw new AppError('CMS_ARTICLE_NOT_FOUND', `article "${slug}" not found`, 404);
    }

    const justPublished = input.isPublished === true && !existing.isPublished;
    const article = await this.prisma.article.update({
      where: { slug },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}),
        ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
        ...(input.content !== undefined ? { content: input.content as Prisma.InputJsonValue } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(justPublished ? { publishedAt: new Date() } : {}),
        ...(input.categoryPageId !== undefined ? { categoryPageId: input.categoryPageId } : {}),
      },
    });
    return { ...article, publishedAt: article.publishedAt?.toISOString() ?? null, updatedAt: article.updatedAt.toISOString() };
  }

  async deleteArticle(slug: string) {
    const existing = await this.prisma.article.findUnique({ where: { slug } });
    if (!existing) {
      throw new AppError('CMS_ARTICLE_NOT_FOUND', `article "${slug}" not found`, 404);
    }
    await this.prisma.article.delete({ where: { slug } });
  }
}
