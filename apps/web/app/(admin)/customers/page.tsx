'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CustomerDetail, CustomerListItem } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { searchCustomers } from '@/lib/customers-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { CustomerCardList } from '@/components/admin/customers/CustomerCardList';
import { CustomerDetailDrawer } from '@/components/admin/customers/CustomerDetailDrawer';
import { CustomerSearchBar } from '@/components/admin/customers/CustomerSearchBar';
import { CustomerTable } from '@/components/admin/customers/CustomerTable';
import { NewCustomerWizard } from '@/components/admin/customers/NewCustomerWizard';

/** staff / manager 均可建立顧客（建立時後端強制鎖定為自己所屬分店） */
function canCreateCustomer(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager' || role === 'staff';
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>();
  const [user, setUser] = useState<AuthUser>();
  const [lastQuery, setLastQuery] = useState('');

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const runSearch = useCallback(async (query: string) => {
    setLastQuery(query);
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await searchCustomers(query);
      setCustomers(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch('');
  }, [runSearch]);

  // 顧客編號/區域/分店/建立日期這幾欄列表才有，CustomerDetail（建檔/更新後拿到的回應）沒有完整帶這些欄位，
  // 與其手動拼湊容易漏欄位，直接重新查一次列表最單純，也順便確保畫面看到的是後端目前真正的可見範圍。
  //
  // 建檔精靈現在連同顧客簽名都簽完才會呼叫這支（見 NewCustomerWizard），所以建檔完成後
  // 直接打開這位顧客的詳細資料，不用使用者自己再從列表裡找一次。
  function handleCreated(customer: CustomerDetail) {
    setWizardOpen(false);
    setSelectedCustomerId(customer.id);
    void runSearch(lastQuery);
  }

  function handleUpdated(_customer: CustomerDetail) {
    void runSearch(lastQuery);
  }

  function handleDeleted() {
    setSelectedCustomerId(undefined);
    void runSearch(lastQuery);
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">顧客資料</h1>
        {canCreateCustomer(user?.role) && (
          <KioskButton onClick={() => setWizardOpen(true)} className="hidden md:inline-flex">
            ＋ 新增顧客
          </KioskButton>
        )}
      </div>

      <CustomerSearchBar onSearch={runSearch} />

      {loadError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {loadError}
        </p>
      )}
      {loading && <p className="text-kiosk-base text-slate-500">載入中…</p>}
      {!loading && !loadError && customers.length === 0 && (
        <p className="text-kiosk-base text-slate-500">目前沒有符合條件的顧客</p>
      )}

      <CustomerTable customers={customers} onSelect={(customer) => setSelectedCustomerId(customer.id)} />
      <CustomerCardList customers={customers} onSelect={(customer) => setSelectedCustomerId(customer.id)} />

      {/* 手機版：重點按鈕固定置底，永遠在大拇指範圍內 */}
      {canCreateCustomer(user?.role) && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:hidden">
          <KioskButton fullWidth onClick={() => setWizardOpen(true)}>
            ＋ 新增顧客
          </KioskButton>
        </div>
      )}

      <CenteredModal open={wizardOpen} onClose={() => setWizardOpen(false)} title="新增顧客">
        <NewCustomerWizard onCreated={handleCreated} onClose={() => setWizardOpen(false)} />
      </CenteredModal>

      <CenteredModal
        open={selectedCustomerId !== undefined}
        onClose={() => setSelectedCustomerId(undefined)}
        title="顧客詳細資料"
        closeOnOverlayClick
      >
        {selectedCustomerId !== undefined && (
          <CustomerDetailDrawer customerId={selectedCustomerId} onUpdated={handleUpdated} onDeleted={handleDeleted} />
        )}
      </CenteredModal>
    </div>
  );
}
