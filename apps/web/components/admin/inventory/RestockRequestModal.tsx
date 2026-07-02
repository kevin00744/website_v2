'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createRestockRequestSchema, type CreateRestockRequestInput, type ProductSummary, type RestockRequestSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createRestockRequest, listProducts } from '@/lib/inventory-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';

interface RestockRequestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (request: RestockRequestSummary) => void;
}

/**
 * 店長提出補貨請求：跟記錄商品使用（InventoryConsumeModal）不同，這裡選的是「商品目錄」
 * （listProducts，所有上架商品），不是「目前已經有庫存的品項」——補貨請求本來就常常是
 * 因為某個商品快沒貨甚至已經沒貨才要提，不能只能選還有現貨的東西。
 */
export function RestockRequestModal({ open, onClose, onCreated }: RestockRequestModalProps) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<CreateRestockRequestInput>({
    resolver: zodResolver(createRestockRequestSchema),
    mode: 'onChange',
    defaultValues: { productId: undefined, quantity: undefined, note: '' },
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError(undefined);
    reset({ productId: undefined, quantity: undefined, note: '' });
    listProducts()
      .then(setProducts)
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : '載入商品目錄失敗，請稍後再試'));
  }, [open, reset]);

  async function onSubmit(values: CreateRestockRequestInput) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const created = await createRestockRequest(values);
      onCreated(created);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '提出補貨請求失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title="提出補貨請求" maxWidthClassName="md:max-w-2xl">
      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        <KioskSelect
          label="商品"
          required
          placeholder="請選擇需要補貨的商品"
          options={products.map((product) => ({ value: String(product.id), label: `${product.name}（${product.sku}）` }))}
          errorMessage={errors.productId?.message}
          isValid={Boolean(dirtyFields.productId) && !errors.productId}
          {...register('productId', { valueAsNumber: true })}
        />
        <KioskInput
          label="需要補貨的數量"
          type="number"
          required
          min={1}
          placeholder="請輸入數量"
          errorMessage={errors.quantity?.message}
          isValid={Boolean(dirtyFields.quantity) && !errors.quantity}
          {...register('quantity', { valueAsNumber: true })}
        />
        <KioskInput
          label="備註"
          placeholder="例如：這週末有活動需要提前備貨（選填）"
          errorMessage={errors.note?.message}
          isValid={Boolean(dirtyFields.note) && !errors.note}
          {...register('note')}
        />

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? '送出中…' : '送出補貨請求'}
          </KioskButton>
          <KioskButton type="button" variant="ghost" fullWidth onClick={onClose} disabled={submitting}>
            取消
          </KioskButton>
        </div>
      </form>
    </CenteredModal>
  );
}
