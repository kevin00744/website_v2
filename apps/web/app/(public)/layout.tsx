import { GlobalHeader } from '@/components/cms/GlobalHeader';
import { GlobalFooter } from '@/components/cms/GlobalFooter';
import { listNavPages } from '@/lib/cms-public-fetch';

/** 整個前台官網（首頁/各個 CMS 頁面/最新消息/搜尋結果）共用同一套 Header/Footer，導覽列內容是後台「官網頁面管理」即時設定出來的 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const pages = await listNavPages();
  return (
    <div className="flex min-h-screen flex-col">
      <GlobalHeader pages={pages} />
      <div className="flex-1">{children}</div>
      <GlobalFooter />
    </div>
  );
}
