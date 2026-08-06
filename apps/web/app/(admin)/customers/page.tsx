'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomerDetail, CustomerListItem } from '@website-v2/shared-types';
import { REGION_LABEL } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { searchCustomers } from '@/lib/customers-api';
import { listStores } from '@/lib/stores-api';
import type { StoreSummary } from '@website-v2/shared-types';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';
import { CustomerCardList } from '@/components/admin/customers/CustomerCardList';
import { CustomerDetailDrawer } from '@/components/admin/customers/CustomerDetailDrawer';
import { CustomerSearchBar } from '@/components/admin/customers/CustomerSearchBar';
import { CustomerTable } from '@/components/admin/customers/CustomerTable';
import { NewCustomerWizard } from '@/components/admin/customers/NewCustomerWizard';

function canCreateCustomer(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager' || role === 'staff';
}

function canFilterByRegionOrStore(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'dealer' || role === 'general_agent';
}

const REGION_OPTIONS = [
  { value: '', label: '全部區域' },
  { value: 'A', label: REGION_LABEL['A'] },
  { value: 'B', label: REGION_LABEL['B'] },
  { value: 'C', label: REGION_LABEL['C'] },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>();
  const [user, setUser] = useState<AuthUser>();
  const [stores, setStores] = useState<StoreSummary[]>([]);

  // Use refs for filter state to avoid stale closure in CustomerSearchBar callback
  const filterRef = useRef({ query: '', region: '', storeId: '' });
  const [filterRegion, setFilterRegion] = useState('');
  const [filterStoreId, setFilterStoreId] = useState('');

  useEffect(() => {
    const authUser = getAuthUser();
    setUser(authUser);
    if (canFilterByRegionOrStore(authUser?.role)) {
      listStores().then(setStores).catch(() => setStores([]));
    }
  }, []);

  const doSearch = useCallback(async (query: string, region: string, storeId: string) => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const result = await searchCustomers(query, {
        region: region || undefined,
        storeId: storeId ? Number(storeId) : undefined,
      });
      setCustomers(result);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '系統出了一點問題，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  // Stable onSearch callback for CustomerSearchBar — reads current filters from ref
  const handleSearch = useCallback((query: string) => {
    filterRef.current.query = query;
    void doSearch(query, filterRef.current.region, filterRef.current.storeId);
  }, [doSearch]);

  // Initial load
  useEffect(() => {
    void doSearch('', '', '');
  }, [doSearch]);

  function handleRegionChange(region: string) {
    const storeId = ''; // clear store when region changes
    filterRef.current.region = region;
    filterRef.current.storeId = storeId;
    setFilterRegion(region);
    setFilterStoreId(storeId);
    void doSearch(filterRef.current.query, region, storeId);
  }

  function handleStoreChange(storeId: string) {
    filterRef.current.storeId = storeId;
    setFilterStoreId(storeId);
    void doSearch(filterRef.current.query, filterRef.current.region, storeId);
  }

  function clearFilters() {
    filterRef.current.region = '';
    filterRef.current.storeId = '';
    setFilterRegion('');
    setFilterStoreId('');
    void doSearch(filterRef.current.query, '', '');
  }

  function handleCreated(customer: CustomerDetail) {
    setWizardOpen(false);
    setSelectedCustomerId(customer.id);
    void doSearch(filterRef.current.query, filterRef.current.region, filterRef.current.storeId);
  }

  function handleUpdated(_customer: CustomerDetail) {
    void doSearch(filterRef.current.query, filterRef.current.region, filterRef.current.storeId);
  }

  function handleDeleted() {
    setSelectedCustomerId(undefined);
    void doSearch(filterRef.current.query, filterRef.current.region, filterRef.current.storeId);
  }

  const showFilters = canFilterByRegionOrStore(user?.role);
  const storeOptions = [
    { value: '', label: '全部分店' },
    ...stores
      .filter((s) => !filterRegion || s.region === filterRegion)
      .map((s) => ({ value: String(s.id), label: s.name })),
  ];
  const hasActiveFilter = filterRegion || filterStoreId;

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

      <CustomerSearchBar onSearch={handleSearch} />

      {showFilters && (
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[140px]">
            <KioskSelect
              label="區域"
              options={REGION_OPTIONS}
              value={filterRegion}
              onChange={(e) => handleRegionChange(e.target.value)}
            />
          </div>
          <div className="min-w-[180px]">
            <KioskSelect
              label="分店"
              options={storeOptions}
              value={filterStoreId}
              onChange={(e) => handleStoreChange(e.target.value)}
            />
          </div>
          {hasActiveFilter && (
            <div className="flex items-end">
              <KioskButton variant="ghost" onClick={clearFilters}>
                清除篩選
              </KioskButton>
            </div>
          )}
        </div>
      )}

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
