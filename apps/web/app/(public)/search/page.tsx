import type { Metadata } from 'next';
import Link from 'next/link';
import { searchArticles } from '@/lib/cms-public-fetch';

export const metadata: Metadata = { title: '搜尋結果 | 璨妍 tsanyen' };

interface SearchPageProps {
  searchParams: { q?: string };
}

/** 站內搜尋結果頁，伺服器端渲染——對齊 GlobalHeader 的搜尋框（原生 GET 表單），不需要任何 client-side 狀態 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = searchParams.q?.trim() ?? '';
  const results = query ? await searchArticles(query) : [];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="mb-2 text-3xl font-bold text-slate-900">搜尋結果</h1>
      <p className="mb-8 text-slate-500">{query ? `關鍵字：「${query}」，共找到 ${results.length} 筆常見問題` : '請輸入關鍵字進行搜尋'}</p>

      {query && results.length === 0 && <p className="text-slate-500">找不到符合的內容，換個關鍵字試試看</p>}

      <ul className="flex flex-col gap-4">
        {results.map((result) => (
          <li key={result.slug}>
            <Link
              href={`/news/${result.slug}`}
              className="flex flex-col gap-1 rounded-xl border border-slate-200 px-5 py-4 transition-colors hover:border-kiosk-primary hover:bg-kiosk-primary/5"
            >
              <span className="text-lg font-semibold text-slate-900">{result.title}</span>
              {result.excerpt && <span className="text-slate-600">{result.excerpt}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
