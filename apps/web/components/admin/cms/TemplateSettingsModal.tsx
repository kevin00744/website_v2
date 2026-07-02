'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  createTemplateSchema,
  updateTemplateSchema,
  type CreateTemplateInput,
  type PageTemplateSummary,
  type UpdateTemplateInput,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createCmsTemplate, getCmsTemplateForAdmin, updateCmsTemplateSettings } from '@/lib/cms-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

interface TemplateSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (template: PageTemplateSummary) => void;
  /** 帶這個值是改名既有範本，不帶是新增一個全新的空白範本 */
  editingTemplateId?: number;
}

type FormValues = CreateTemplateInput | UpdateTemplateInput;

/** 跟 PageSettingsModal 平行的版本：範本只有名稱/說明兩個欄位，沒有 slug/SEO/發布狀態這些頁面才需要的東西 */
export function TemplateSettingsModal({ open, onClose, onSaved, editingTemplateId }: TemplateSettingsModalProps) {
  const isEditing = Boolean(editingTemplateId);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isEditing ? updateTemplateSchema : createTemplateSchema),
    mode: 'onChange',
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError(undefined);
    setLoadError(undefined);

    if (editingTemplateId) {
      getCmsTemplateForAdmin(editingTemplateId)
        .then((template) => reset({ name: template.name, description: template.description ?? '' }))
        .catch((error) => setLoadError(error instanceof ApiError ? error.message : '載入範本資料失敗，請稍後再試'));
    } else {
      reset({ name: '', description: '' });
    }
  }, [open, editingTemplateId, reset]);

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const saved = editingTemplateId
        ? await updateCmsTemplateSettings(editingTemplateId, values)
        : await createCmsTemplate(values as CreateTemplateInput);
      onSaved({ id: saved.id, name: saved.name, description: saved.description, updatedAt: saved.updatedAt });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title={isEditing ? '範本設定' : '新增範本'} maxWidthClassName="md:max-w-xl">
      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        <KioskInput
          label="範本名稱"
          required
          placeholder="例如：活動頁範本"
          errorMessage={errors.name?.message}
          isValid={Boolean(dirtyFields.name) && !errors.name}
          {...register('name')}
        />
        <KioskInput
          label="說明（選填）"
          placeholder="這個範本適合用在什麼場合"
          errorMessage={errors.description?.message}
          isValid={Boolean(dirtyFields.description) && !errors.description}
          {...register('description')}
        />

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? '儲存中…' : '儲存'}
          </KioskButton>
          <KioskButton type="button" variant="ghost" fullWidth onClick={onClose} disabled={submitting}>
            取消
          </KioskButton>
        </div>
      </form>
    </CenteredModal>
  );
}
