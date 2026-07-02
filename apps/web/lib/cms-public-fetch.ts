import type { NavPageItem, PublicPage, SearchResultItem } from '@website-v2/shared-types';

/**
 * 跟 app/(public)/[slug]/cms-fetch.ts 同樣的理由：這支只給 Server Component 用，
 * 在 web 容器「裡面」執行，要用容器內部網址連 api 容器，不能用瀏覽器用的 NEXT_PUBLIC_API_BASE_URL。
 * 放在 lib/ 底下（不是某個 route 資料夾裡）是因為首頁（page.tsx）跟導覽列（layout.tsx）
 * 兩個不同路由都要用同一支，放在共用路徑下比較合理。
 */
const CMS_API_INTERNAL_URL = process.env.CMS_API_INTERNAL_URL ?? 'http://api:3000/api/v2';

/** 哪個頁面是首頁由後台設定決定（CmsService.getHomepage()），不是寫死 slug === 'home' */
export async function getHomepage(): Promise<PublicPage | null> {
  const response = await fetch(`${CMS_API_INTERNAL_URL}/cms/homepage`, { cache: 'no-store' });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status} while loading homepage`);
  }
  return (await response.json()) as PublicPage;
}

/** 導覽列用：已發布、showInNav=true 的頁面，依 navOrder 排序 */
export async function listNavPages(): Promise<NavPageItem[]> {
  const response = await fetch(`${CMS_API_INTERNAL_URL}/cms/nav-pages`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status} while loading nav pages`);
  }
  return (await response.json()) as NavPageItem[];
}

/** 站內搜尋（/search 結果頁用）：範圍限定在常見問題（文章），對標題/摘要/內容做關鍵字模糊搜尋 */
export async function searchArticles(query: string): Promise<SearchResultItem[]> {
  const response = await fetch(`${CMS_API_INTERNAL_URL}/cms/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status} while searching articles`);
  }
  return (await response.json()) as SearchResultItem[];
}
