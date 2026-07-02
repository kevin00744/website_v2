import type { PublicPage } from '@website-v2/shared-types';

/**
 * 這支只給 Server Component 用，不能沿用 lib/api-client.ts 的 apiRequest——那支是瀏覽器端用的，
 * 靠 cookie 拿 JWT token，但這裡是公開端點本來就不需要登入，而且 Server Component 是在
 * web 這個容器「裡面」執行，CMS_API_INTERNAL_URL（docker compose 內部網路位址）才連得到 api 容器，
 * NEXT_PUBLIC_API_BASE_URL（瀏覽器用的 localhost:3101）在容器裡面解析不到。
 */
const CMS_API_INTERNAL_URL = process.env.CMS_API_INTERNAL_URL ?? 'http://api:3000/api/v2';

export async function getPublishedPage(slug: string): Promise<PublicPage | null> {
  const response = await fetch(`${CMS_API_INTERNAL_URL}/cms/pages/${slug}`, { cache: 'no-store' });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status} while loading cms page "${slug}"`);
  }
  return (await response.json()) as PublicPage;
}
