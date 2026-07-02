import type { PublicArticleDetail, PublicArticleListResult } from '@website-v2/shared-types';

/** 跟 [slug]/cms-fetch.ts 同樣的理由：Server Component 在 web 容器內執行，要用容器內部網址連 api，不能用瀏覽器用的 NEXT_PUBLIC_API_BASE_URL */
const CMS_API_INTERNAL_URL = process.env.CMS_API_INTERNAL_URL ?? 'http://api:3000/api/v2';

export async function listPublishedArticles(search?: string, page?: number): Promise<PublicArticleListResult> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page) params.set('page', String(page));

  const response = await fetch(`${CMS_API_INTERNAL_URL}/cms/articles?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status} while loading article list`);
  }
  return (await response.json()) as PublicArticleListResult;
}

export async function getPublishedArticle(slug: string): Promise<PublicArticleDetail | null> {
  const response = await fetch(`${CMS_API_INTERNAL_URL}/cms/articles/${slug}`, { cache: 'no-store' });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status} while loading article "${slug}"`);
  }
  return (await response.json()) as PublicArticleDetail;
}
