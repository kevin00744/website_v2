'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { RecentlyDeletedModal } from '@/components/admin/customers/RecentlyDeletedModal';

function canCreateCustomer(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager' || role === 'staff';
}

/** 對齊後端 GET /customers/deleted、POST /customers/:id/restore 的 @Roles('manager') */
function canRestoreCustomer(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager';
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>();
  const [user, setUser] = useState<AuthUser>();

  const queryRef = useRef('');

  useEffect(() => {
    setUser(getAuthUser());
    // 從行事曆「顧客資料」連過來：/customers?customerId=123 直接打開該顧客
    const id = Number(new URLSearchParams(window.location.search).get('customerId'));
    if (id) {
      setSelectedCustomerId(id);
      window.history.replaceState(null, '', '/customers');
    }
  }, []);

  const doSearch = useCallback(async (query: string) => {
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

  // Stable onSearch callback for CustomerSearchBar — 記住目前關鍵字，新增/刪除/還原後用同一個關鍵字重新整理
  const handleSearch = useCallback((query: string) => {
    queryRef.current = query;
    void doSearch(query);
  }, [doSearch]);

  // Initial load
  useEffect(() => {
    void doSearch('');
  }, [doSearch]);

  function handleCreated(customer: CustomerDetail) {
    setWizardOpen(false);
    setSelectedCustomerId(customer.id);
    void doSearch(queryRef.current);
  }

  function handleUpdated(_customer: CustomerDetail) {
    void doSearch(queryRef.current);
  }

  function handleDeleted() {
    setSelectedCustomerId(undefined);
    void doSearch(queryRef.current);
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">顧客資料</h1>
        <div className="flex flex-wrap gap-3">
          {canRestoreCustomer(user?.role) && (
            <KioskButton variant="ghost" onClick={() => setDeletedOpen(true)}>
              🗑 最近刪除
            </KioskButton>
          )}
          {canCreateCustomer(user?.role) && (
            <KioskButton onClick={() => setWizardOpen(true)} className="hidden md:inline-flex">
              ＋ 新增顧客
            </KioskButton>
          )}
        </div>
      </div>

      <CustomerSearchBar onSearch={handleSearch} />

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

      {canCreateCustomer(user?.role) && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 pb-safe md:hidden">
          <KioskButton fullWidth onClick={() => setWizardOpen(true)}>
            ＋ 新增顧客
          </KioskButton>
        </div>
      )}

      <CenteredModal open={wizardOpen} onClose={() => setWizardOpen(false)} title="新增顧客">
        <NewCustomerWizard onCreated={handleCreated} onClose={() => setWizardOpen(false)} />
      </CenteredModal>

      <CenteredModal open={deletedOpen} onClose={() => setDeletedOpen(false)} title="最近刪除的顧客" closeOnOverlayClick>
        {deletedOpen && (
          <RecentlyDeletedModal onRestored={() => void doSearch(queryRef.current)} />
        )}
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
