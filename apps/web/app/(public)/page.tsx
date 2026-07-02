import type { Metadata } from 'next';
import { BlockRenderer } from '@/components/cms/BlockRenderer';
import { getHomepage } from '@/lib/cms-public-fetch';

/** 哪個頁面是首頁由後台 CMS 設定決定（CmsService.getHomepage()），不是寫死 slug === 'home' */
export async function generateMetadata(): Promise<Metadata> {
  const page = await getHomepage();
  if (!page) return {};
  return { title: page.title, description: page.metaDescription ?? undefined };
}

export default async function HomePage() {
  const page = await getHomepage();
  if (!page) {
    return <main className="p-12 text-center text-slate-500">首頁尚未設定，請至後台「官網頁面管理」把其中一個頁面設為首頁並發布</main>;
  }
  return <BlockRenderer content={page.content} />;
}
