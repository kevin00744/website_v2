'use client';

import { useEffect, useState } from 'react';
import type { PublicArticleSummary } from '@website-v2/shared-types';
import { resolveApiBaseUrl } from '@/lib/api-client';
import { formatDate } from '@/lib/format';

export interface ArticleListBlockProps {
  title: string;
  limit: number;
}

/**
 * 真實的「文章堆疊」區塊：跟舊版手動填寫消息項目的 NewsList 不同，這支直接打公開的
 * GET /cms/articles 端點，永遠顯示資料庫裡實際已發布的文章（新到舊），管理員只要在
 * /cms-articles 發文，所有放了這個區塊的頁面都會自動同步更新，不用回到頁面編輯器手動加項目。
 *
 * 'use client' + useEffect 抓資料是因為這個區塊要同時能在 Puck 編輯器（client）跟前台
 * BlockRenderer（server）兩種上下文使用同一份元件——用 resolveApiBaseUrl()（依瀏覽器目前
 * 網址動態算出 API 主機，不會在外網訪客身上錯誤解析成 localhost）在 hydrate 後抓資料，
 * 跟 ImageUploadField/CarouselBlock 是同一種「個別區塊自己決定要不要 client-side 邏輯」的慣例，
 * 不影響 puck-config.tsx 本身保持非 client 的狀態。
 */
export function ArticleListBlock({ title, limit }: ArticleListBlockProps) {
  const [articles, setArticles] = useState<PublicArticleSummary[]>();
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${resolveApiBaseUrl()}/cms/articles?pageSize=${limit}`)
      .then((response) => {
        if (!response.ok) throw new Error('failed to load articles');
        return response.json();
      })
      .then((result) => setArticles(result.items))
      .catch(() => setError(true));
  }, [limit]);

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12">
      <h2 className="mb-6 text-2xl font-bold text-slate-900 md:text-3xl">{title}</h2>
      {error && <p className="text-slate-500">最新消息載入失敗，請稍後再試</p>}
      {!error && articles && articles.length === 0 && <p className="text-slate-500">目前還沒有最新消息</p>}
      {!error && articles && (
        <ul className="flex flex-col gap-3">
          {articles.map((article) => (
            <li key={article.slug}>
              <a
                href={`/news/${article.slug}`}
                className="flex flex-col gap-1 rounded-xl border border-slate-200 px-5 py-4 transition-colors hover:border-kiosk-primary hover:bg-kiosk-primary/5 md:flex-row md:items-center md:justify-between"
              >
                <span className="font-semibold text-slate-900">{article.title}</span>
                {article.publishedAt && <span className="text-sm text-slate-500">{formatDate(article.publishedAt)}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
