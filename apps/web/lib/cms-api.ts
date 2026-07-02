import type {
  ArticleDetail,
  ArticleSummary,
  CreateArticleInput,
  CreatePageInput,
  CreateTemplateInput,
  PageContent,
  PageDetail,
  PageOption,
  PageSummary,
  PageTemplateDetail,
  PageTemplateSummary,
  UpdateArticleSettingsInput,
  UpdatePageSettingsInput,
  UpdateTemplateInput,
} from '@website-v2/shared-types';
import { apiRequest } from './api-client';

export function listCmsPages(): Promise<PageSummary[]> {
  return apiRequest<PageSummary[]>('/cms/admin/pages');
}

/** content 通常是套版型（page-templates.ts 的 buildTemplateContent，或選了自訂範本時抓回來的內容）算出來的初始 JSON，不帶就是空白頁面 */
export function createCmsPage(input: CreatePageInput, content?: PageContent): Promise<PageDetail> {
  return apiRequest<PageDetail>('/cms/admin/pages', { method: 'POST', json: { ...input, content } });
}

/** 給編輯器載入用：跟前台公開端點不同，這支不篩 isPublished，草稿也讀得到，且需要登入 */
export function getCmsPageForAdmin(slug: string): Promise<PageDetail> {
  return apiRequest<PageDetail>(`/cms/admin/pages/${slug}`);
}

export function updateCmsPageSettings(slug: string, input: UpdatePageSettingsInput): Promise<PageDetail> {
  return apiRequest<PageDetail>(`/cms/admin/pages/${slug}`, { method: 'PUT', json: input });
}

/** Puck 編輯器內建的「Publish」按鈕呼叫的就是這支，只更新 content，不動標題/SEO/發布狀態 */
export function updateCmsPageContent(slug: string, content: PageContent): Promise<PageDetail> {
  return apiRequest<PageDetail>(`/cms/admin/pages/${slug}`, { method: 'PUT', json: { content } });
}

/** 硬刪除（Page 沒有軟刪除機制，跟 deleteCmsTemplate/deleteCmsArticle 一樣） */
export function deleteCmsPage(slug: string): Promise<void> {
  return apiRequest<void>(`/cms/admin/pages/${slug}`, { method: 'DELETE' });
}

/**
 * 上傳圖片：後端回傳的是相對路徑（例如 /cms/uploads/xxx.png）。這裡故意不組合
 * NEXT_PUBLIC_API_BASE_URL 變成 http://localhost:3101/... 這種絕對網址存進 content JSON——
 * 訪客不一定是從 localhost 開這個網站（手機連 LAN IP、tunnel 測試等），絕對網址在那些情境下
 * 瀏覽器端會連不到。改成存 /api/v2/cms/uploads/xxx.png 這種同源相對路徑，搭配
 * next.config.js 的 rewrites（web 容器內部轉發給 api 容器），不管訪客從哪個網域開站，
 * 圖片都會打回同一個來源，一定連得到。
 */
export async function uploadCmsImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const result = await apiRequest<{ url: string }>('/cms/admin/uploads', { method: 'POST', formData });
  return `/api/v2${result.url}`;
}

export function listCmsTemplates(): Promise<PageTemplateSummary[]> {
  return apiRequest<PageTemplateSummary[]>('/cms/admin/templates');
}

export function createCmsTemplate(input: CreateTemplateInput, content?: PageContent): Promise<PageTemplateDetail> {
  return apiRequest<PageTemplateDetail>('/cms/admin/templates', { method: 'POST', json: { ...input, content } });
}

export function getCmsTemplateForAdmin(id: number): Promise<PageTemplateDetail> {
  return apiRequest<PageTemplateDetail>(`/cms/admin/templates/${id}`);
}

export function updateCmsTemplateSettings(id: number, input: UpdateTemplateInput): Promise<PageTemplateDetail> {
  return apiRequest<PageTemplateDetail>(`/cms/admin/templates/${id}`, { method: 'PUT', json: input });
}

/** Puck 編輯器內建的「Publish」按鈕用這支存範本的 content（跟 updateCmsPageContent 平行的版本） */
export function updateCmsTemplateContent(id: number, content: PageContent): Promise<PageTemplateDetail> {
  return apiRequest<PageTemplateDetail>(`/cms/admin/templates/${id}`, { method: 'PUT', json: { content } });
}

export function deleteCmsTemplate(id: number): Promise<void> {
  return apiRequest<void>(`/cms/admin/templates/${id}`, { method: 'DELETE' });
}

export function listCmsArticles(): Promise<ArticleSummary[]> {
  return apiRequest<ArticleSummary[]>('/cms/admin/articles');
}

/** categoryPageId 故意允許 null（表單算出「不分類」後送的值）——後端用 undefined 代表「這次不動這個欄位」、null 代表「明確清空分類」，是兩個不同語意 */
export function createCmsArticle(
  input: Omit<CreateArticleInput, 'categoryPageId'> & { categoryPageId?: number | null },
  content?: PageContent,
): Promise<ArticleDetail> {
  return apiRequest<ArticleDetail>('/cms/admin/articles', { method: 'POST', json: { ...input, content } });
}

export function getCmsArticleForAdmin(slug: string): Promise<ArticleDetail> {
  return apiRequest<ArticleDetail>(`/cms/admin/articles/${slug}`);
}

export function updateCmsArticleSettings(
  slug: string,
  input: Omit<UpdateArticleSettingsInput, 'categoryPageId'> & { categoryPageId?: number | null },
): Promise<ArticleDetail> {
  return apiRequest<ArticleDetail>(`/cms/admin/articles/${slug}`, { method: 'PUT', json: input });
}

/** Puck 編輯器內建的「Publish」按鈕用這支存文章的 content（跟 updateCmsPageContent 平行的版本） */
export function updateCmsArticleContent(slug: string, content: PageContent): Promise<ArticleDetail> {
  return apiRequest<ArticleDetail>(`/cms/admin/articles/${slug}`, { method: 'PUT', json: { content } });
}

export function deleteCmsArticle(slug: string): Promise<void> {
  return apiRequest<void>(`/cms/admin/articles/${slug}`, { method: 'DELETE' });
}

/** 文章設定畫面「放在哪一個頁面底下」的下拉選單用 */
export function listCmsPageOptions(): Promise<PageOption[]> {
  return apiRequest<PageOption[]>('/cms/admin/page-options');
}
