'use client';

import { getCmsTemplateForAdmin, updateCmsTemplateContent } from '@/lib/cms-api';
import { ContentEditorOverlay, EMPTY_PUCK_DATA, type PuckData } from './ContentEditorOverlay';

interface TemplateContentEditorProps {
  templateId: number;
  title: string;
  onClose: () => void;
}

/** 跟 PageContentEditor 平行的版本，唯一差別是 load/save 打的是 /admin/templates/:id 而不是 /admin/pages/:slug */
export function TemplateContentEditor({ templateId, title, onClose }: TemplateContentEditorProps) {
  return (
    <ContentEditorOverlay
      title={title}
      onClose={onClose}
      load={async () => {
        const template = await getCmsTemplateForAdmin(templateId);
        const stored = template.content as Partial<PuckData> | undefined;
        return stored?.content ? (stored as PuckData) : EMPTY_PUCK_DATA;
      }}
      save={async (data) => {
        await updateCmsTemplateContent(templateId, data as Record<string, unknown>);
      }}
    />
  );
}
