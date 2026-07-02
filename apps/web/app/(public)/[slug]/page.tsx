import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlockRenderer } from '@/components/cms/BlockRenderer';
import { getPublishedPage } from './cms-fetch';

interface CmsPageProps {
  params: { slug: string };
}

/** 把 CmsPagesPage 後台存的 title/metaDescription 接到 Next.js 的 <head>，這就是這個動態路由唯一的 SEO 來源 */
export async function generateMetadata({ params }: CmsPageProps): Promise<Metadata> {
  const page = await getPublishedPage(params.slug);
  if (!page) return {};

  return {
    title: page.title,
    description: page.metaDescription ?? undefined,
  };
}

/**
 * content 是 Puck 區塊編輯器存下來的結構化 JSON（{ content: [{type,props}], root }），
 * 不是現成的 HTML 字串，所以這裡完全不用 dangerouslySetInnerHTML——交給 BlockRenderer
 * 照每個區塊的 type 動態渲染對應的 Tailwind React 元件（跟後台編輯器預覽共用同一份元件）。
 */
export default async function CmsPage({ params }: CmsPageProps) {
  const page = await getPublishedPage(params.slug);
  if (!page) {
    notFound();
  }

  return <BlockRenderer content={page.content} />;
}
