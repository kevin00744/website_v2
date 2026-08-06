import type { CustomerListItem } from '@website-v2/shared-types';
import { formatDate } from '@/lib/format';

interface CustomerCardListProps {
  customers: CustomerListItem[];
  onSelect: (customer: CustomerListItem) => void;
}

const REGION_LABEL: Record<CustomerListItem['region'], string> = {
  A: '北部',
  B: '中部',
  C: '南部',
};

/**
 * 手機版（<768px）：卡片式列表，取代表格（表格在小螢幕擠成一團很難點）。
 * 區域/分店/顧客編號/建立日期同樣顯示，給多店權限的角色看清楚顧客歸屬。
 */
export function CustomerCardList({ customers, onSelect }: CustomerCardListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {customers.map((customer) => (
        <li key={customer.id}>
          <button
            type="button"
            onClick={() => onSelect(customer)}
            className="flex min-h-kiosk w-full flex-col gap-1 rounded-kiosk bg-white px-5 py-4 text-left shadow-sm active:bg-kiosk-primary/5"
          >
            <span className="text-kiosk-lg font-bold text-slate-900">{customer.name}</span>
            <span className="text-kiosk-base text-slate-600">{customer.phone ?? '尚未填寫電話'}</span>
            <span className="text-kiosk-base text-slate-500">{customer.nationalId ?? '—'}</span>
            <span className="text-kiosk-base text-slate-500">
              {customer.customerCode ?? '—'} · {REGION_LABEL[customer.region]} {customer.storeName}
            </span>
            {customer.dealerName && (
              <span className="text-kiosk-base text-slate-400">負責代理：{customer.dealerName}</span>
            )}
            <span className="text-kiosk-base text-slate-400">建立於 {formatDate(customer.createdAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
