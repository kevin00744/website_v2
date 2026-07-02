import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { listPublishedArticles } from './cms-fetch';

export const metadata: Metadata = { title: '最新消息 | 璨妍 tsanyen' };

interface NewsPageProps {
  searchParams: { q?: string; page?: string };
}

/**
 * 文章列表頁，搜尋用最單純的 GET 表單（?q=關鍵字）而不是 client-side fetch——伺服器端渲染、
 * 不需要 JS 也能搜尋，分頁也是用 query string（?page=2），跟既有 [slug] 動態路由一樣完全是
 * Server Component，沒有任何瀏覽器端狀態。
 */
export default async function NewsPage({ searchParams }: NewsPageProps) {
  const search = searchParams.q?.trim() || undefined;
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const result = await listPublishedArticles(search, page);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">最新消息</h1>

      <form className="mb-8 flex gap-2" action="/news">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="搜尋文章標題或摘要"
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-base"
        />
        <button type="submit" className="rounded-xl bg-kiosk-primary px-5 py-2 font-semibold text-white">
          搜尋
        </button>
      </form>

      {result.items.length === 0 && <p className="text-slate-500">{search ? `找不到符合「${search}」的文章` : '目前還沒有發布任何文章'}</p>}

      <ul className="flex flex-col gap-4">
        {result.items.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/news/${article.slug}`}
              className="flex flex-col gap-1 rounded-xl border border-slate-200 px-5 py-4 transition-colors hover:border-kiosk-primary hover:bg-kiosk-primary/5"
            >
              <span className="text-lg font-semibold text-slate-900">{article.title}</span>
              {article.excerpt && <span className="text-slate-600">{article.excerpt}</span>}
              {article.publishedAt && <span className="text-sm text-slate-400">{formatDate(article.publishedAt)}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <Link
              key={pageNumber}
              href={`/news?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(pageNumber) }).toString()}`}
              className={`rounded-lg px-3 py-1 ${pageNumber === page ? 'bg-kiosk-primary text-white' : 'text-slate-600'}`}
            >
              {pageNumber}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
