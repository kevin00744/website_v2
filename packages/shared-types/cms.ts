import { z } from 'zod';

export const pageSlugSchema = z
  .string()
  .trim()
  .min(1, '網址路徑不能空白')
  .max(80, '網址路徑好像太長了，請確認一下')
  .regex(/^[a-z0-9-]+$/, '網址路徑只能用小寫英文字母、數字與「-」');

export const pageTitleSchema = z.string().trim().min(1, '頁面標題不能空白').max(100, '標題好像太長了，請確認一下');

/** SEO 描述允許空白（選填），但有填的話限制長度，避免摘要被搜尋引擎截斷得很難看 */
export const pageMetaDescriptionSchema = z
  .string()
  .trim()
  .max(160, 'SEO 描述建議不要超過 160 字，太長的話搜尋結果會被截斷')
  .optional()
  .or(z.literal(''));

/**
 * 「新增頁面」表單的版型下拉選單值，混合兩種來源：
 * - 內建版型（blank/news-article/landing-page）：寫死在 apps/web/lib/puck/page-templates.ts，純前端常數。
 * - 自訂版型（DB 裡的 PageTemplate）：值是 `db:{id}` 字串，選中後前端會打 API 把該筆範本的 content 抓回來用。
 * 後端完全不知道、也不需要知道「版型」這個概念，所以這裡故意不用嚴格的 enum 限制值域
 * （自訂版型的 id 是動態的，沒辦法在這裡窮舉），只當作一般字串驗證。
 */
export const createPageSchema = z.object({
  slug: pageSlugSchema,
  title: pageTitleSchema,
  metaDescription: pageMetaDescriptionSchema,
  isPublished: z.boolean(),
  isHomepage: z.boolean(),
  showInNav: z.boolean(),
  navOrder: z.coerce.number().int(),
  /** 純前端用：送出前會被轉換成 content JSON 一起送出，不會原樣傳給後端 */
  template: z.string().optional(),
});
export type CreatePageInput = z.infer<typeof createPageSchema>;

export const templateNameSchema = z.string().trim().min(1, '範本名稱不能空白').max(100, '名稱好像太長了，請確認一下');
export const templateDescriptionSchema = z
  .string()
  .trim()
  .max(200, '說明好像太長了，請確認一下')
  .optional()
  .or(z.literal(''));

export const createTemplateSchema = z.object({
  name: templateNameSchema,
  description: templateDescriptionSchema,
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: templateNameSchema,
  description: templateDescriptionSchema,
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

/** 編輯既有頁面的基本設定（不含 content，content 是區塊編輯器自己存的） */
export const updatePageSettingsSchema = z.object({
  title: pageTitleSchema,
  metaDescription: pageMetaDescriptionSchema,
  isPublished: z.boolean(),
  isHomepage: z.boolean(),
  showInNav: z.boolean(),
  navOrder: z.coerce.number().int(),
});
export type UpdatePageSettingsInput = z.infer<typeof updatePageSettingsSchema>;

/**
 * 存進 Page.content 這個 Json 欄位的形狀——故意只定義成不透明的 Record，不直接 import Puck 的
 * `Data` 型別：這個 packages/shared-types 套件同時被 apps/api（後端）跟 apps/web（前端）一起用，
 * 後端完全不需要、也不該裝 @puckeditor/core 這種前端編輯器套件當依賴。實際結構是 Puck 的
 * `{ content: ComponentData[], root: {...} }`，需要強型別的地方（puck-config.tsx/BlockRenderer.tsx）
 * 在前端自己 cast 成 `@puckeditor/core` 的 `Data` 型別即可。
 */
export type PageContent = Record<string, unknown>;

/** 對應後端 CmsService.listPages()，後台列表用，故意不含 content（避免列表載入時拖一堆沒用到的資料） */
export interface PageSummary {
  id: number;
  slug: string;
  title: string;
  isPublished: boolean;
  isHomepage: boolean;
  showInNav: boolean;
  navOrder: number;
  updatedAt: string;
}

/** 對應後端 CmsService.createPage()/updatePageBySlug()/getPageBySlugForAdmin()，後台用，含完整 content */
export interface PageDetail {
  id: number;
  slug: string;
  title: string;
  metaDescription: string | null;
  content: PageContent;
  isPublished: boolean;
  isHomepage: boolean;
  showInNav: boolean;
  navOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 對應後端 CmsService.getPublishedPageBySlug()/getHomepage()，前台公開渲染用，只有已發布的頁面才拿得到 */
export interface PublicPage {
  slug: string;
  title: string;
  metaDescription: string | null;
  content: PageContent;
  updatedAt: string;
}

/** 對應後端 CmsService.listNavPages()，前台導覽列用 */
export interface NavPageItem {
  slug: string;
  title: string;
  navOrder: number;
}

/** 對應後端 CmsService.listPageOptions()，文章設定畫面「放在哪一個頁面底下」下拉選單用 */
export interface PageOption {
  id: number;
  title: string;
  slug: string;
}

/** 對應後端 CmsService.listTemplates()，範本列表用，故意不含 content */
export interface PageTemplateSummary {
  id: number;
  name: string;
  description: string | null;
  updatedAt: string;
}

/** 對應後端 CmsService.createTemplate()/updateTemplate()/getTemplateById()，含完整 content */
export interface PageTemplateDetail {
  id: number;
  name: string;
  description: string | null;
  content: PageContent;
  createdAt: string;
  updatedAt: string;
}

export const articleSlugSchema = pageSlugSchema;
export const articleTitleSchema = z.string().trim().min(1, '文章標題不能空白').max(100, '標題好像太長了，請確認一下');
export const articleExcerptSchema = z
  .string()
  .trim()
  .max(200, '摘要建議不要超過 200 字，太長的話列表會被截斷')
  .optional()
  .or(z.literal(''));

/** categoryPageId 是「這篇文章放在哪一個頁面底下」，選填——空字串代表「不分類」，送出前會轉成 null */
export const createArticleSchema = z.object({
  slug: articleSlugSchema,
  title: articleTitleSchema,
  excerpt: articleExcerptSchema,
  coverImageUrl: z.string().optional().or(z.literal('')),
  isPublished: z.boolean(),
  categoryPageId: z.coerce.number().int().optional().or(z.literal('')),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

/** 編輯既有文章的基本設定（不含 content，content 是區塊編輯器自己存的，跟 UpdatePageSettingsInput 同樣的分工） */
export const updateArticleSettingsSchema = z.object({
  title: articleTitleSchema,
  excerpt: articleExcerptSchema,
  coverImageUrl: z.string().optional().or(z.literal('')),
  isPublished: z.boolean(),
  categoryPageId: z.coerce.number().int().optional().or(z.literal('')),
});
export type UpdateArticleSettingsInput = z.infer<typeof updateArticleSettingsSchema>;

/** 對應後端 CmsService.listArticlesForAdmin()，後台列表用，故意不含 content */
export interface ArticleSummary {
  id: number;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  isPublished: boolean;
  updatedAt: string;
  categoryPageId: number | null;
  categoryPageTitle: string | null;
}

/** 對應後端 CmsService.createArticle()/updateArticleBySlug()/getArticleBySlugForAdmin()，後台用，含完整 content */
export interface ArticleDetail {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  content: PageContent;
  isPublished: boolean;
  publishedAt: string | null;
  categoryPageId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 對應後端 CmsService.listPublishedArticles()，前台文章列表（常見問題頁、ArticleList/FaqList 區塊）用，故意不含 content */
export interface PublicArticleSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  categoryPageId: number | null;
  categoryPageTitle: string | null;
}

export interface PublicArticleListResult {
  items: PublicArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 對應後端 CmsService.searchArticles()，站內搜尋結果用——範圍限定在常見問題（文章）內容 */
export interface SearchResultItem {
  slug: string;
  title: string;
  excerpt: string | null;
}

/** 對應後端 CmsService.getPublishedArticleBySlug()，前台文章詳情頁用 */
export interface PublicArticleDetail {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  content: PageContent;
  publishedAt: string | null;
  updatedAt: string;
}
