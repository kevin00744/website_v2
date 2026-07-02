'use client';

import { getCmsArticleForAdmin, updateCmsArticleContent } from '@/lib/cms-api';
import { ContentEditorOverlay, EMPTY_PUCK_DATA, type PuckData } from './ContentEditorOverlay';

interface ArticleContentEditorProps {
  slug: string;
  title: string;
  onClose: () => void;
}

/** 跟 PageContentEditor 平行的版本，唯一差別是 load/save 打的是 /admin/articles/:slug 而不是 /admin/pages/:slug */
export function ArticleContentEditor({ slug, title, onClose }: ArticleContentEditorProps) {
  return (
    <ContentEditorOverlay
      title={title}
      onClose={onClose}
      load={async () => {
        const article = await getCmsArticleForAdmin(slug);
        const stored = article.content as Partial<PuckData> | undefined;
        return stored?.content ? (stored as PuckData) : EMPTY_PUCK_DATA;
      }}
      save={async (data) => {
        await updateCmsArticleContent(slug, data as Record<string, unknown>);
      }}
    />
  );
}
