'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  createArticleSchema,
  updateArticleSettingsSchema,
  type ArticleSummary,
  type CreateArticleInput,
  type PageOption,
  type UpdateArticleSettingsInput,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createCmsArticle, getCmsArticleForAdmin, listCmsPageOptions, updateCmsArticleSettings } from '@/lib/cms-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';
import { ImageUploadField } from './ImageUploadField';

const NO_CATEGORY_VALUE = '';

interface ArticleSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (article: ArticleSummary) => void;
  /** 帶這個值就是編輯既有文章的基本設定，不帶就是新增文章 */
  editingSlug?: string;
}

type FormValues = (CreateArticleInput | UpdateArticleSettingsInput) & { slug: string };

/**
 * 跟 PageSettingsModal 平行的版本：文章用 excerpt（列表摘要）+ coverImageUrl（封面圖）
 * 取代頁面的 metaDescription，沒有「版型」選項——文章一律從空白內容開始，
 * 在 ArticleContentEditor 那個全螢幕畫面用 Puck 編輯。slug 一樣編輯模式下不可改
 * （PUT 用 slug 當識別碼，改 slug 等於變成另一篇文章，會讓既有連結/SEO 失效）。
 */
export function ArticleSettingsModal({ open, onClose, onSaved, editingSlug }: ArticleSettingsModalProps) {
  const isEditing = Boolean(editingSlug);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isEditing ? updateArticleSettingsSchema : createArticleSchema),
    mode: 'onChange',
    defaultValues: { slug: '', title: '', excerpt: '', coverImageUrl: '', isPublished: false, categoryPageId: NO_CATEGORY_VALUE },
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError(undefined);
    setLoadError(undefined);

    listCmsPageOptions()
      .then(setPageOptions)
      .catch(() => setPageOptions([])); // 頁面清單拿不到不影響文章本身的設定，安靜降級成只能選「不分類」

    if (editingSlug) {
      getCmsArticleForAdmin(editingSlug)
        .then((article) => {
          reset({
            slug: article.slug,
            title: article.title,
            excerpt: article.excerpt ?? '',
            coverImageUrl: article.coverImageUrl ?? '',
            isPublished: article.isPublished,
            categoryPageId: article.categoryPageId === null ? NO_CATEGORY_VALUE : article.categoryPageId,
          });
        })
        .catch((error) => setLoadError(error instanceof ApiError ? error.message : '載入文章資料失敗，請稍後再試'));
    } else {
      reset({ slug: '', title: '', excerpt: '', coverImageUrl: '', isPublished: false, categoryPageId: NO_CATEGORY_VALUE });
    }
  }, [open, editingSlug, reset]);

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const { slug, categoryPageId, ...settings } = values;
      const normalizedCategoryPageId = categoryPageId === NO_CATEGORY_VALUE || categoryPageId === undefined ? null : Number(categoryPageId);
      const saved = editingSlug
        ? await updateCmsArticleSettings(editingSlug, { ...settings, categoryPageId: normalizedCategoryPageId })
        : await createCmsArticle({ ...(settings as CreateArticleInput), slug, categoryPageId: normalizedCategoryPageId });
      onSaved({
        id: saved.id,
        slug: saved.slug,
        title: saved.title,
        coverImageUrl: saved.coverImageUrl,
        isPublished: saved.isPublished,
        updatedAt: saved.updatedAt,
        categoryPageId: saved.categoryPageId,
        categoryPageTitle: pageOptions.find((option) => option.id === saved.categoryPageId)?.title ?? null,
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title={isEditing ? '文章設定' : '新增文章'} maxWidthClassName="md:max-w-2xl">
      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        {isEditing ? (
          <div className="flex flex-col gap-1">
            <span className="text-kiosk-base font-bold text-slate-800">網址路徑（不可修改）</span>
            <span className="text-kiosk-lg font-bold text-slate-900">/news/{editingSlug}</span>
          </div>
        ) : (
          <KioskInput
            label="網址路徑（slug）"
            required
            placeholder="例如 product-launch（只能用小寫英文字母、數字與「-」）"
            errorMessage={errors.slug?.message}
            isValid={Boolean(dirtyFields.slug) && !errors.slug}
            {...register('slug')}
          />
        )}

        <KioskInput
          label="文章標題"
          required
          placeholder="請輸入文章標題"
          errorMessage={errors.title?.message}
          isValid={Boolean(dirtyFields.title) && !errors.title}
          {...register('title')}
        />

        <KioskInput
          label="摘要"
          placeholder="列表頁顯示的摘要文字（選填，建議 200 字以內）"
          errorMessage={errors.excerpt?.message}
          isValid={Boolean(dirtyFields.excerpt) && !errors.excerpt}
          {...register('excerpt')}
        />

        <div className="flex flex-col gap-2">
          <span className="text-kiosk-base font-bold text-slate-800">封面圖片（選填）</span>
          <Controller
            name="coverImageUrl"
            control={control}
            render={({ field }) => <ImageUploadField value={field.value} onChange={field.onChange} />}
          />
        </div>

        <KioskSelect
          label="放在哪一個頁面底下（選填）"
          options={[{ value: NO_CATEGORY_VALUE, label: '不分類' }, ...pageOptions.map((option) => ({ value: String(option.id), label: option.title }))]}
          errorMessage={errors.categoryPageId?.message}
          isValid={Boolean(dirtyFields.categoryPageId) && !errors.categoryPageId}
          {...register('categoryPageId')}
        />

        <label className="flex items-center gap-3 rounded-kiosk border-2 border-slate-200 bg-white p-4">
          <input type="checkbox" className="h-6 w-6" {...register('isPublished')} />
          <span className="text-kiosk-base font-bold text-slate-900">發布這篇文章（前台會公開顯示）</span>
        </label>

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
