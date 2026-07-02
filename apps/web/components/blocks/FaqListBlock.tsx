'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicArticleSummary } from '@website-v2/shared-types';
import { resolveApiBaseUrl } from '@/lib/api-client';

export interface FaqListBlockProps {
  title: string;
  /** 選填，對應某個 Page 的 id——只抓 categoryPageId 等於這個值的文章；不填就是全部已發布文章都列出來（取代原本的「最新消息」清單） */
  categoryPageId?: number;
  limit: number;
}

const ALL_CATEGORY_VALUE = '__all__';

/**
 * 常見問題清單：跟 ArticleListBlock 同一個資料來源（GET /cms/articles），但呈現方式不同——
 * 每一題只先顯示標題（問題），按「more」才連到 /news/{slug} 看完整說明，不是像最新消息那樣
 * 整排都點得進去（最新消息已經併入這裡，不再是獨立的導覽項目）。
 *
 * 分類篩選下拉選單是給訪客「選擇要看哪一邊（哪個分類）的文章」用：選項從這次抓回來的文章裡
 * 即時整理出有哪些分類（categoryPageTitle），不用額外打一支 API 查全部分類——管理員在
 * /cms-articles 用「放在哪一個頁面底下」設定文章分類，這裡篩選下拉的選項就會自動跟著有什麼。
 */
export function FaqListBlock({ title, categoryPageId, limit }: FaqListBlockProps) {
  const [items, setItems] = useState<PublicArticleSummary[]>();
  const [error, setError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY_VALUE);

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: String(limit) });
    if (categoryPageId) params.set('categoryPageId', String(categoryPageId));

    fetch(`${resolveApiBaseUrl()}/cms/articles?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error('failed to load faq articles');
        return response.json();
      })
      .then((result) => setItems(result.items))
      .catch(() => setError(true));
  }, [categoryPageId, limit]);

  const categoryOptions = useMemo(() => {
    if (!items) return [];
    const seen = new Map<number, string>();
    items.forEach((item) => {
      if (item.categoryPageId && item.categoryPageTitle) {
        seen.set(item.categoryPageId, item.categoryPageTitle);
      }
    });
    return Array.from(seen.entries()).map(([id, categoryTitle]) => ({ id, title: categoryTitle }));
  }, [items]);

  const visibleItems =
    selectedCategory === ALL_CATEGORY_VALUE ? items : items?.filter((item) => String(item.categoryPageId) === selectedCategory);

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">{title}</h2>
        {categoryOptions.length > 0 && (
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            aria-label="依分類篩選"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={ALL_CATEGORY_VALUE}>全部分類</option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-slate-500">常見問題載入失敗，請稍後再試</p>}
      {!error && visibleItems && visibleItems.length === 0 && <p className="text-slate-500">目前還沒有相關內容</p>}
      {!error && visibleItems && (
        <ul className="flex flex-col gap-3">
          {visibleItems.map((item) => (
            <li
              key={item.slug}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-slate-900">{item.title}</span>
                {item.excerpt && <span className="text-sm text-slate-500">{item.excerpt}</span>}
              </div>
              <a
                href={`/news/${item.slug}`}
                className="shrink-0 self-start rounded-lg border border-kiosk-primary px-4 py-2 text-sm font-semibold text-kiosk-primary hover:bg-kiosk-primary/10 md:self-center"
              >
                more →
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
