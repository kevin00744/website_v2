import type { PageSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { formatDate } from '@/lib/format';

interface CmsPageTableProps {
  pages: PageSummary[];
  onEditSettings: (page: PageSummary) => void;
  onEditContent: (page: PageSummary) => void;
  onDelete: (page: PageSummary) => void;
  deletingSlug?: string;
}

/** iPad/桌機版（≥768px）：大氣留白的資料表格，手機版隱藏改用 CmsPageCardList */
export function CmsPageTable({ pages, onEditSettings, onEditContent, onDelete, deletingSlug }: CmsPageTableProps) {
  return (
    <table className="hidden w-full border-separate border-spacing-y-3 md:table">
      <thead>
        <tr className="text-left text-kiosk-base text-slate-500">
          <th className="px-4">頁面標題</th>
          <th className="px-4">網址路徑</th>
          <th className="px-4">發布狀態</th>
          <th className="px-4">最後更新時間</th>
          <th className="px-4" />
        </tr>
      </thead>
      <tbody>
        {pages.map((page) => (
          <tr key={page.id} className="rounded-kiosk bg-white text-kiosk-base text-slate-800 shadow-sm">
            <td className="rounded-l-kiosk px-4 py-5 font-semibold">
              {page.title} {page.isHomepage && <span className="ml-1 text-sm text-kiosk-primary">（首頁）</span>}
              {!page.showInNav && <span className="ml-1 text-sm text-slate-400">（不顯示在導覽列）</span>}
            </td>
            <td className="px-4 py-5 font-mono text-slate-600">/{page.slug}</td>
            <td className="px-4 py-5">
              <span
                className={`rounded-kiosk px-3 py-1 font-semibold ${
                  page.isPublished ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {page.isPublished ? '已發布' : '草稿'}
              </span>
            </td>
            <td className="px-4 py-5">{formatDate(page.updatedAt)}</td>
            <td className="rounded-r-kiosk px-4 py-5">
              <div className="flex gap-2">
                <KioskButton variant="secondary" onClick={() => onEditSettings(page)}>
                  設定
                </KioskButton>
                <KioskButton variant="primary" onClick={() => onEditContent(page)}>
                  編輯內容
                </KioskButton>
                <KioskButton variant="danger" onClick={() => onDelete(page)} disabled={deletingSlug === page.slug}>
                  {deletingSlug === page.slug ? '刪除中…' : '刪除'}
                </KioskButton>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
