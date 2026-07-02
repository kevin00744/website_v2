import Link from 'next/link';
import type { NavPageItem } from '@website-v2/shared-types';

interface GlobalHeaderProps {
  pages: NavPageItem[];
}

/**
 * 全站共用導覽列：左邊列出後台設定為「顯示在導覽列」的已發布頁面（依 navOrder 排序）——
 * 原本這裡固定多寫死一個「最新消息」連到 /news，現在取消了，文章內容（包含原本最新消息的那些）
 * 統一收進「常見問題」這個頁面裡（FaqList 區塊不分類別、列出所有已發布文章），常見問題本身
 * 已經是一個正常的 Page，會自動出現在 pages 清單裡，不需要再寫死任何文章相關的導覽項目。
 * /news/[slug] 文章詳情頁路由還是保留（常見問題清單按「more」連過去的就是這支）。
 *
 * 右上角搜尋框故意用原生 <form method="get" action="/search">，不是 'use client' + onSubmit——
 * 這樣不需要任何 JavaScript 就能運作（按 Enter 直接送出 GET /search?q=關鍵字），
 * 整個 Header 維持 Server Component，不用為了一個搜尋框把整條導覽列都變成 client bundle。
 * 搜尋範圍限定在常見問題（文章）內容，見 CmsService.searchArticles() 的說明。
 */
export function GlobalHeader({ pages }: GlobalHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <nav className="flex items-center gap-1 overflow-x-auto">
          <Link href="/" className="mr-4 shrink-0 text-lg font-bold text-slate-900">
            璨妍 tsanyen
          </Link>
          {pages.map((page) => (
            <Link
              key={page.slug}
              href={`/${page.slug}`}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-kiosk-primary/10 hover:text-kiosk-primary"
            >
              {page.title}
            </Link>
          ))}
        </nav>

        <form action="/search" method="get" role="search" className="shrink-0">
          <input
            type="search"
            name="q"
            placeholder="搜尋常見問題…"
            aria-label="搜尋常見問題"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:w-56"
          />
        </form>
      </div>
    </header>
  );
}
