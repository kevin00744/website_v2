'use client';

import { getCmsPageForAdmin, updateCmsPageContent } from '@/lib/cms-api';
import { ContentEditorOverlay, EMPTY_PUCK_DATA, type PuckData } from './ContentEditorOverlay';

interface PageContentEditorProps {
  slug: string;
  title: string;
  onClose: () => void;
}

/**
 * 跟舊版 GrapesJS 整合最大的差異：管理員只能從 puckConfig 預先定義好的區塊清單裡選，
 * 右側欄只會出現該區塊定義好的表單欄位，不會出現任何 CSS/樣式調整的控制項——版面/響應式樣式
 * 完全鎖在各區塊元件裡（Tailwind class 寫死），不會被拖拉操作跑版破壞。
 */
export function PageContentEditor({ slug, title, onClose }: PageContentEditorProps) {
  return (
    <ContentEditorOverlay
      title={title}
      onClose={onClose}
      load={async () => {
        const page = await getCmsPageForAdmin(slug);
        // content 是上次儲存時 Puck 的 onPublish 資料原樣存回的 JSON；全新頁面（從沒存過內容）會是空物件
        const stored = page.content as Partial<PuckData> | undefined;
        return stored?.content ? (stored as PuckData) : EMPTY_PUCK_DATA;
      }}
      save={async (data) => {
        await updateCmsPageContent(slug, data as Record<string, unknown>);
      }}
    />
  );
}
