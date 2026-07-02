'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createProductSchema, updateProductSchema, type CreateProductInput, type ProductAdminSummary, type UpdateProductInput } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createProduct, updateProduct } from '@/lib/products-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

interface ProductSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (product: ProductAdminSummary) => void;
  /** 帶這個值就是編輯既有商品，不帶就是新增商品 */
  editingProduct?: ProductAdminSummary;
}

type FormValues = (CreateProductInput | UpdateProductInput) & { isActive?: boolean };

/** 新增/編輯共用同一個 Modal，差別只是編輯模式多了一個「上架中」開關（新增的商品預設就是上架狀態，不需要額外問） */
export function ProductSettingsModal({ open, onClose, onSaved, editingProduct }: ProductSettingsModalProps) {
  const isEditing = Boolean(editingProduct);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isEditing ? updateProductSchema : createProductSchema),
    mode: 'onChange',
    defaultValues: { sku: '', name: '', unit: '', description: '', isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError(undefined);
    reset(
      editingProduct
        ? {
            sku: editingProduct.sku,
            name: editingProduct.name,
            unit: editingProduct.unit ?? '',
            description: editingProduct.description ?? '',
            isActive: editingProduct.isActive,
          }
        : { sku: '', name: '', unit: '', description: '', isActive: true },
    );
  }, [open, editingProduct, reset]);

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const saved = editingProduct
        ? await updateProduct(editingProduct.id, values as UpdateProductInput)
        : await createProduct(values as CreateProductInput);
      onSaved(saved);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title={isEditing ? '編輯商品' : '新增商品'} maxWidthClassName="md:max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        <KioskInput
          label="商品編號（SKU）"
          required
          placeholder="例如 SK-001"
          errorMessage={errors.sku?.message}
          isValid={Boolean(dirtyFields.sku) && !errors.sku}
          {...register('sku')}
        />
        <KioskInput
          label="商品名稱"
          required
          placeholder="請輸入商品名稱"
          errorMessage={errors.name?.message}
          isValid={Boolean(dirtyFields.name) && !errors.name}
          {...register('name')}
        />
        <KioskInput
          label="單位"
          placeholder="例如：瓶、盒、份（選填）"
          errorMessage={errors.unit?.message}
          isValid={Boolean(dirtyFields.unit) && !errors.unit}
          {...register('unit')}
        />
        <KioskInput
          label="說明"
          placeholder="商品說明（選填）"
          errorMessage={errors.description?.message}
          isValid={Boolean(dirtyFields.description) && !errors.description}
          {...register('description')}
        />

        {isEditing && (
          <label className="flex items-center gap-3 rounded-kiosk border-2 border-slate-200 bg-white p-4">
            <input type="checkbox" className="h-6 w-6" {...register('isActive')} />
            <span className="text-kiosk-base font-bold text-slate-900">上架中（不勾選即下架，門市/補貨清單都選不到）</span>
          </label>
        )}

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? '儲存中…' : isEditing ? '儲存修改' : '建立商品'}
          </KioskButton>
          <KioskButton type="button" variant="ghost" fullWidth onClick={onClose} disabled={submitting}>
            取消
          </KioskButton>
        </div>
      </form>
    </CenteredModal>
  );
}
