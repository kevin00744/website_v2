import type { PageSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { formatDate } from '@/lib/format';

interface CmsPageCardListProps {
  pages: PageSummary[];
  onEditSettings: (page: PageSummary) => void;
  onEditContent: (page: PageSummary) => void;
  onDelete: (page: PageSummary) => void;
  deletingSlug?: string;
}

/** 手機版（<768px）：卡片式列表，表格在小螢幕擠成一團很難點 */
export function CmsPageCardList({ pages, onEditSettings, onEditContent, onDelete, deletingSlug }: CmsPageCardListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {pages.map((page) => (
        <li key={page.id} className="flex flex-col gap-3 rounded-kiosk bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-kiosk-lg font-bold text-slate-900">
                {page.title} {page.isHomepage && <span className="text-sm text-kiosk-primary">（首頁）</span>}
              </span>
              <span className="font-mono text-kiosk-base text-slate-500">/{page.slug}</span>
              <span className="text-kiosk-base text-slate-400">最後更新：{formatDate(page.updatedAt)}</span>
            </div>
            <span
              className={`shrink-0 rounded-kiosk px-3 py-1 text-kiosk-base font-semibold ${
                page.isPublished ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {page.isPublished ? '已發布' : '草稿'}
            </span>
          </div>
          <div className="flex gap-2">
            <KioskButton variant="secondary" fullWidth onClick={() => onEditSettings(page)}>
              設定
            </KioskButton>
            <KioskButton variant="primary" fullWidth onClick={() => onEditContent(page)}>
              編輯內容
            </KioskButton>
          </div>
          <KioskButton variant="danger" fullWidth onClick={() => onDelete(page)} disabled={deletingSlug === page.slug}>
            {deletingSlug === page.slug ? '刪除中…' : '刪除'}
          </KioskButton>
        </li>
      ))}
    </ul>
  );
}
