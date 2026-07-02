'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  inquiryCategorySchema,
  INQUIRY_CATEGORY_KIND_LABEL,
  type InquiryCategoryInput,
  type InquiryCategorySummary,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createInquiryCategory, updateInquiryCategory } from '@/lib/contact-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';

interface InquiryCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (category: InquiryCategorySummary) => void;
  editingCategory?: InquiryCategorySummary;
}

const KIND_OPTIONS = Object.entries(INQUIRY_CATEGORY_KIND_LABEL).map(([value, label]) => ({ value, label }));

/**
 * 新增/編輯詢問類別共用同一個 Modal——kind 決定這個類別的訊息會怎麼分派（見後端
 * ContactService 的說明），管理員改 kind 不會動到已經存在的訊息，只影響之後新送進來的訊息。
 */
export function InquiryCategoryModal({ open, onClose, onSaved, editingCategory }: InquiryCategoryModalProps) {
  const isEditing = Boolean(editingCategory);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<InquiryCategoryInput>({
    resolver: zodResolver(inquiryCategorySchema),
    mode: 'onChange',
    defaultValues: { name: '', kind: 'other', isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError(undefined);
    reset(
      editingCategory
        ? { name: editingCategory.name, kind: editingCategory.kind, isActive: editingCategory.isActive }
        : { name: '', kind: 'other', isActive: true },
    );
  }, [open, editingCategory, reset]);

  async function onSubmit(values: InquiryCategoryInput) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const saved = editingCategory
        ? await updateInquiryCategory(editingCategory.id, values)
        : await createInquiryCategory(values);
      onSaved(saved);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title={isEditing ? '編輯詢問類別' : '新增詢問類別'} maxWidthClassName="md:max-w-xl">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        <KioskInput
          label="類別名稱"
          required
          placeholder="例如：加盟諮詢"
          errorMessage={errors.name?.message}
          isValid={Boolean(dirtyFields.name) && !errors.name}
          {...register('name')}
        />
        <KioskSelect
          label="分派方式"
          required
          options={KIND_OPTIONS}
          errorMessage={errors.kind?.message}
          isValid={Boolean(dirtyFields.kind) && !errors.kind}
          {...register('kind')}
        />

        {isEditing && (
          <label className="flex items-center gap-3 rounded-kiosk border-2 border-slate-200 bg-white p-4">
            <input type="checkbox" className="h-6 w-6" {...register('isActive')} />
            <span className="text-kiosk-base font-bold text-slate-900">上架中（不勾選即從前台表單下拉選單移除）</span>
          </label>
        )}

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? '儲存中…' : isEditing ? '儲存修改' : '建立類別'}
          </KioskButton>
          <KioskButton type="button" variant="ghost" fullWidth onClick={onClose} disabled={submitting}>
            取消
          </KioskButton>
        </div>
      </form>
    </CenteredModal>
  );
}
