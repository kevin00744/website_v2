import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlockRenderer } from '@/components/cms/BlockRenderer';
import { formatDate } from '@/lib/format';
import { getPublishedArticle } from '../cms-fetch';

interface ArticlePageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const article = await getPublishedArticle(params.slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.excerpt ?? undefined,
  };
}

/** content 一樣是 Puck 區塊 JSON，跟 [slug]/page.tsx（一般頁面）共用同一個 BlockRenderer */
export default async function ArticlePage({ params }: ArticlePageProps) {
  const article = await getPublishedArticle(params.slug);
  if (!article) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="mb-2 text-3xl font-bold text-slate-900">{article.title}</h1>
      {article.publishedAt && <p className="mb-8 text-sm text-slate-400">{formatDate(article.publishedAt)}</p>}
      <BlockRenderer content={article.content} />
    </main>
  );
}
