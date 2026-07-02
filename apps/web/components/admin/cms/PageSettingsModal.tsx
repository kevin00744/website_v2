'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  createPageSchema,
  updatePageSettingsSchema,
  type CreatePageInput,
  type PageSummary,
  type PageTemplateSummary,
  type UpdatePageSettingsInput,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createCmsPage, getCmsPageForAdmin, getCmsTemplateForAdmin, listCmsTemplates, updateCmsPageSettings } from '@/lib/cms-api';
import { PAGE_TEMPLATE_OPTIONS, buildTemplateContent } from '@/lib/puck/page-templates';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';

interface PageSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (page: PageSummary) => void;
  /** 帶這個值就是編輯既有頁面的基本設定，不帶就是新增頁面 */
  editingSlug?: string;
}

/** 自訂範本的下拉選項值用 `db:{id}` 前綴跟內建版型的鍵值（blank/news-article/landing-page）區分 */
const CUSTOM_TEMPLATE_PREFIX = 'db:';

type FormValues = (CreatePageInput | UpdatePageSettingsInput) & { slug: string; template?: string };

/**
 * slug 只在新增時可以填，編輯模式下純文字顯示、不可修改——後端 PUT 是用 slug 當識別碼，
 * 改 slug 等於變成另一個頁面，會讓既有的前台連結/SEO 全部失效，所以乾脆不開放修改。
 * 這個 Modal 只管「基本設定」（標題/SEO/發布狀態/新增時選版型），content 之後在
 * PageContentEditor 那個全螢幕畫面用 Puck 編輯——「版型」只是幫 content 填一個初始值，
 * 之後一樣可以在那邊自由增減調整，不是建立後就鎖死的東西。
 *
 * 版型下拉選單混合兩種來源：寫死的內建版型（page-templates.ts）+ /cms-templates 範本庫管理頁面
 * 建立的自訂範本（從 API 即時抓清單）。
 */
export function PageSettingsModal({ open, onClose, onSaved, editingSlug }: PageSettingsModalProps) {
  const isEditing = Boolean(editingSlug);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [customTemplates, setCustomTemplates] = useState<PageTemplateSummary[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isEditing ? updatePageSettingsSchema : createPageSchema),
    mode: 'onChange',
    defaultValues: {
      slug: '',
      title: '',
      metaDescription: '',
      isPublished: false,
      isHomepage: false,
      showInNav: true,
      navOrder: 0,
      template: 'blank',
    },
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError(undefined);
    setLoadError(undefined);

    if (editingSlug) {
      getCmsPageForAdmin(editingSlug)
        .then((page) => {
          reset({
            slug: page.slug,
            title: page.title,
            metaDescription: page.metaDescription ?? '',
            isPublished: page.isPublished,
            isHomepage: page.isHomepage,
            showInNav: page.showInNav,
            navOrder: page.navOrder,
          });
        })
        .catch((error) => setLoadError(error instanceof ApiError ? error.message : '載入頁面資料失敗，請稍後再試'));
    } else {
      reset({ slug: '', title: '', metaDescription: '', isPublished: false, isHomepage: false, showInNav: true, navOrder: 0, template: 'blank' });
      listCmsTemplates()
        .then(setCustomTemplates)
        .catch(() => setCustomTemplates([])); // 範本清單拿不到不影響建立頁面本身，安靜降級成只剩內建版型可選
    }
  }, [open, editingSlug, reset]);

  async function resolveTemplateContent(template: string | undefined) {
    if (template?.startsWith(CUSTOM_TEMPLATE_PREFIX)) {
      const id = Number(template.slice(CUSTOM_TEMPLATE_PREFIX.length));
      const customTemplate = await getCmsTemplateForAdmin(id);
      return customTemplate.content;
    }
    return buildTemplateContent((template as Parameters<typeof buildTemplateContent>[0]) ?? 'blank');
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const { template, ...settings } = values;
      const saved = editingSlug
        ? await updateCmsPageSettings(editingSlug, settings)
        : await createCmsPage(settings as CreatePageInput, await resolveTemplateContent(template));
      onSaved({
        id: saved.id,
        slug: saved.slug,
        title: saved.title,
        isPublished: saved.isPublished,
        isHomepage: saved.isHomepage,
        showInNav: saved.showInNav,
        navOrder: saved.navOrder,
        updatedAt: saved.updatedAt,
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  const templateOptions = [
    ...PAGE_TEMPLATE_OPTIONS,
    ...customTemplates.map((template) => ({ value: `${CUSTOM_TEMPLATE_PREFIX}${template.id}`, label: `📦 ${template.name}` })),
  ];

  return (
    <CenteredModal open={open} onClose={onClose} title={isEditing ? '頁面設定' : '新增頁面'} maxWidthClassName="md:max-w-2xl">
      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        {isEditing ? (
          <div className="flex flex-col gap-1">
            <span className="text-kiosk-base font-bold text-slate-800">網址路徑（不可修改）</span>
            <span className="text-kiosk-lg font-bold text-slate-900">/{editingSlug}</span>
          </div>
        ) : (
          <KioskInput
            label="網址路徑（slug）"
            required
            placeholder="例如 home、services（只能用小寫英文字母、數字與「-」）"
            errorMessage={errors.slug?.message}
            isValid={Boolean(dirtyFields.slug) && !errors.slug}
            {...register('slug')}
          />
        )}

        <KioskInput
          label="頁面標題"
          required
          placeholder="請輸入頁面標題"
          errorMessage={errors.title?.message}
          isValid={Boolean(dirtyFields.title) && !errors.title}
          {...register('title')}
        />

        <KioskInput
          label="SEO 描述"
          placeholder="搜尋結果顯示的摘要文字（選填，建議 160 字以內）"
          errorMessage={errors.metaDescription?.message}
          isValid={Boolean(dirtyFields.metaDescription) && !errors.metaDescription}
          {...register('metaDescription')}
        />

        {!isEditing && (
          <KioskSelect
            label="選擇版型（Template）"
            options={templateOptions}
            errorMessage={errors.template?.message}
            isValid={Boolean(dirtyFields.template) && !errors.template}
            {...register('template')}
          />
        )}

        <label className="flex items-center gap-3 rounded-kiosk border-2 border-slate-200 bg-white p-4">
          <input type="checkbox" className="h-6 w-6" {...register('isPublished')} />
          <span className="text-kiosk-base font-bold text-slate-900">發布這個頁面（前台會公開顯示）</span>
        </label>

        <label className="flex items-center gap-3 rounded-kiosk border-2 border-slate-200 bg-white p-4">
          <input type="checkbox" className="h-6 w-6" {...register('isHomepage')} />
          <div className="flex flex-col">
            <span className="text-kiosk-base font-bold text-slate-900">設為首頁</span>
            <span className="text-kiosk-base text-slate-500">勾選後，訪客打開網站根網址（/）時會看到這個頁面，原本的首頁會自動取消</span>
          </div>
        </label>

        <label className="flex items-center gap-3 rounded-kiosk border-2 border-slate-200 bg-white p-4">
          <input type="checkbox" className="h-6 w-6" {...register('showInNav')} />
          <span className="text-kiosk-base font-bold text-slate-900">顯示在導覽列</span>
        </label>

        <KioskInput
          label="導覽列排序（數字越小越靠前）"
          type="number"
          errorMessage={errors.navOrder?.message}
          isValid={Boolean(dirtyFields.navOrder) && !errors.navOrder}
          {...register('navOrder')}
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
