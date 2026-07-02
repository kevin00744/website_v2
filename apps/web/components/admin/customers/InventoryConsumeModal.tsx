'use client';

import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { consumeInventorySchema, type ConsumeInventoryInput, type StoreInventorySummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { adjustInventory, listInventory } from '@/lib/inventory-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';
import { KioskSelect } from '../kiosk/KioskSelect';

interface InventoryConsumeModalProps {
  open: boolean;
  onClose: () => void;
  customerId: number;
  storeId: number;
  /** 記錄成功後通知父元件重新整理「商品使用紀錄」Tab，不在這裡自己管那份列表的 state */
  onRecorded: () => void;
}

/**
 * 固定走 type: 'consumption' + customerId 綁定——這個 Modal 只負責「在顧客身上記一筆消耗」，
 * 不是通用的庫存異動介面（進貨/調撥等其他類型留給之後的「分店庫存管理」頁面）。
 */
export function InventoryConsumeModal({ open, onClose, customerId, storeId, onRecorded }: InventoryConsumeModalProps) {
  const [products, setProducts] = useState<StoreInventorySummary[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<ConsumeInventoryInput>({
    resolver: zodResolver(consumeInventorySchema),
    mode: 'onChange',
  });

  const loadProducts = useCallback(async () => {
    setLoadError(undefined);
    try {
      const result = await listInventory(storeId);
      setProducts(result.filter((item) => item.quantity > 0));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '載入庫存清單失敗，請稍後再試');
    }
  }, [storeId]);

  useEffect(() => {
    if (open) {
      setDone(false);
      setSubmitError(undefined);
      reset({ productId: undefined, quantity: undefined, reason: '' });
      void loadProducts();
    }
  }, [open, loadProducts, reset]);

  const selectedProductId = watch('productId');
  const selectedProduct = products.find((item) => item.productId === selectedProductId);

  async function onSubmit(values: ConsumeInventoryInput) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      await adjustInventory({
        storeId,
        productId: values.productId,
        type: 'consumption',
        quantity: values.quantity,
        customerId,
        reason: values.reason,
      });
      setDone(true);
      onRecorded();
      void loadProducts();
      reset({ productId: undefined, quantity: undefined, reason: '' });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '記錄失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title="記錄商品使用" maxWidthClassName="md:max-w-3xl">
      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {!loadError && products.length === 0 && <p className="text-kiosk-base text-slate-500">這間分店目前沒有庫存可以使用</p>}

      {products.length > 0 && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <KioskSelect
            label="使用的商品"
            required
            placeholder="請選擇商品"
            options={products.map((item) => ({
              value: String(item.productId),
              label: `${item.productName}（目前庫存 ${item.quantity}）`,
            }))}
            errorMessage={errors.productId?.message}
            isValid={Boolean(dirtyFields.productId) && !errors.productId}
            {...register('productId', { valueAsNumber: true })}
          />
          <KioskInput
            label="使用數量"
            type="number"
            required
            min={1}
            max={selectedProduct?.quantity}
            placeholder="請輸入使用數量"
            errorMessage={errors.quantity?.message}
            isValid={Boolean(dirtyFields.quantity) && !errors.quantity}
            {...register('quantity', { valueAsNumber: true })}
          />
          <KioskInput
            label="備註"
            placeholder="例如：療程中使用（選填）"
            errorMessage={errors.reason?.message}
            isValid={Boolean(dirtyFields.reason) && !errors.reason}
            {...register('reason')}
          />

          {submitError && (
            <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
              ⚠️ {submitError}
            </p>
          )}
          {done && !submitError && <p className="text-kiosk-base font-semibold text-kiosk-success">已記錄這次商品使用</p>}

          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? '記錄中…' : '確認記錄'}
          </KioskButton>
        </form>
      )}
    </CenteredModal>
  );
}
