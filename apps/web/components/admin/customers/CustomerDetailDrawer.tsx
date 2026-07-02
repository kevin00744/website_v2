'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { customerUpdateSchema, type CustomerDetail, type CustomerUpdateInput } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { deleteCustomer, getCustomerDetail, updateCustomer } from '@/lib/customers-api';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';
import { MaskedPhoneInput } from '../kiosk/MaskedInput';
import { DisclaimerSignSection } from './DisclaimerSignSection';
import { InventoryConsumeModal } from './InventoryConsumeModal';
import { InventoryHistoryTab, type InventoryHistoryTabHandle } from './InventoryHistoryTab';

interface CustomerDetailDrawerProps {
  customerId: number;
  onUpdated: (detail: CustomerDetail) => void;
  onDeleted: () => void;
}

type Tab = 'profile' | 'inventory';

/** 對齊後端 InventoryController 的 @Roles('manager')：admin/system_admin/manager 才能記錄商品使用 */
function canConsumeInventory(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager';
}

/** 對齊後端 CustomersController 的 DELETE :id 路由覆寫 @Roles('admin')：刪顧客只開放給 admin/system_admin */
function canDeleteCustomer(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/**
 * 點開單一顧客才看到的完整內容。
 * 姓名/身分證字號只用純文字顯示（終身鎖定，不放進可編輯表單），
 * 其餘選填欄位走 react-hook-form + customerUpdateSchema，送出打 PATCH。
 */
export function CustomerDetailDrawer({ customerId, onUpdated, onDeleted }: CustomerDetailDrawerProps) {
  const [detail, setDetail] = useState<CustomerDetail>();
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('profile');
  const [consumeModalOpen, setConsumeModalOpen] = useState(false);
  const [user, setUser] = useState<AuthUser>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const historyRef = useRef<InventoryHistoryTabHandle>(null);

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<CustomerUpdateInput>({
    resolver: zodResolver(customerUpdateSchema),
    mode: 'onChange',
    defaultValues: { phone: '', address: '', line: '', email: '', note: '' },
  });

  const loadDetail = useCallback(async () => {
    try {
      const result = await getCustomerDetail(customerId);
      setDetail(result);
      reset({
        phone: result.phone ?? '',
        address: result.address ?? '',
        line: result.line ?? '',
        email: result.email ?? '',
        note: result.note ?? '',
      });
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '載入顧客資料失敗，請稍後再試');
    }
  }, [customerId, reset]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function handleDelete() {
    if (!detail) return;
    if (!window.confirm(`確定要刪除顧客「${detail.name}」嗎？這個動作無法復原。`)) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteCustomer(customerId);
      onDeleted();
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : '刪除顧客失敗，請稍後再試');
    } finally {
      setDeleting(false);
    }
  }

  async function onSubmit(values: CustomerUpdateInput) {
    setSaveError(undefined);
    setSaved(false);
    try {
      const updated = await updateCustomer(customerId, values);
      setDetail(updated);
      setSaved(true);
      onUpdated(updated);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : '更新失敗，請稍後再試');
    }
  }

  if (loadError) {
    return (
      <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
        ⚠️ {loadError}
      </p>
    );
  }

  if (!detail) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* 終身鎖定的核心識別個資：純文字顯示，沒有任何輸入框 */}
      <div className="rounded-kiosk bg-slate-50 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-kiosk-base text-slate-500">姓名（不可修改）</span>
          <span className="text-kiosk-lg font-bold text-slate-900">{detail.name}</span>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <span className="text-kiosk-base text-slate-500">身分證字號（不可修改）</span>
          <span className="text-kiosk-lg font-bold text-slate-900">{detail.nationalId}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <KioskButton variant={tab === 'profile' ? 'primary' : 'secondary'} onClick={() => setTab('profile')}>
            基本資料
          </KioskButton>
          <KioskButton variant={tab === 'inventory' ? 'primary' : 'secondary'} onClick={() => setTab('inventory')}>
            商品使用紀錄
          </KioskButton>
        </div>
        <div className="flex gap-2">
          {canConsumeInventory(user?.role) && (
            <KioskButton variant="secondary" onClick={() => setConsumeModalOpen(true)}>
              ＋ 記錄商品使用
            </KioskButton>
          )}
          {canDeleteCustomer(user?.role) && (
            <KioskButton variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? '刪除中…' : '刪除顧客'}
            </KioskButton>
          )}
        </div>
      </div>

      {deleteError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {deleteError}
        </p>
      )}

      {tab === 'profile' && (
        <>
          <DisclaimerSignSection
            customerId={customerId}
            disclaimerCustomerSignedAt={detail.disclaimerCustomerSignedAt}
            disclaimerStaffSignedAt={detail.disclaimerStaffSignedAt}
            disclaimerFullySigned={detail.disclaimerFullySigned}
            onChanged={() => void loadDetail()}
          />

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
            <MaskedPhoneInput name="phone" control={control} label="電話" errorMessage={errors.phone?.message} />
            <KioskInput
              label="住址"
              placeholder="請輸入住址（選填）"
              errorMessage={errors.address?.message}
              isValid={Boolean(dirtyFields.address) && !errors.address}
              {...register('address')}
            />
            <KioskInput
              label="LINE ID"
              placeholder="請輸入 LINE ID（選填）"
              errorMessage={errors.line?.message}
              isValid={Boolean(dirtyFields.line) && !errors.line}
              {...register('line')}
            />
            <KioskInput
              label="Email"
              placeholder="請輸入 Email（選填）"
              errorMessage={errors.email?.message}
              isValid={Boolean(dirtyFields.email) && !errors.email}
              {...register('email')}
            />
            <KioskInput
              label="備註"
              placeholder="請輸入備註（選填）"
              errorMessage={errors.note?.message}
              isValid={Boolean(dirtyFields.note) && !errors.note}
              {...register('note')}
            />

            {saveError && (
              <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
                ⚠️ {saveError}
              </p>
            )}
            {saved && !saveError && <p className="text-kiosk-base font-semibold text-kiosk-success">已儲存最新資料</p>}

            <div className="mt-auto">
              <KioskButton type="submit" variant="primary" fullWidth disabled={isSubmitting}>
                {isSubmitting ? '儲存中…' : '儲存修改'}
              </KioskButton>
            </div>
          </form>
        </>
      )}

      {tab === 'inventory' && <InventoryHistoryTab ref={historyRef} customerId={customerId} />}

      {canConsumeInventory(user?.role) && (
        <InventoryConsumeModal
          open={consumeModalOpen}
          onClose={() => setConsumeModalOpen(false)}
          customerId={customerId}
          storeId={detail.storeId}
          onRecorded={() => {
            setConsumeModalOpen(false);
            setTab('inventory');
            historyRef.current?.reload();
          }}
        />
      )}
    </div>
  );
}
