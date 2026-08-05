import type { CustomerListItem } from '@website-v2/shared-types';
import { formatDate } from '@/lib/format';

interface CustomerTableProps {
  customers: CustomerListItem[];
  onSelect: (customer: CustomerListItem) => void;
}

const REGION_LABEL: Record<CustomerListItem['region'], string> = {
  A: '北部',
  B: '中部',
  C: '南部',
};

/**
 * iPad/桌機版（≥768px）：資料表格。手機版隱藏，改用 CustomerCardList。
 * 區域/分店/顧客編號/建立日期是給看得到多家店的 admin/system_admin/dealer 用的歸屬資訊，
 * 一般店長自己只有一家店，這幾欄看了也只會重複看到同一個值，但統一顯示比較簡單，
 * 不用為了「manager 隱藏這幾欄」另外寫一套表格。
 */
export function CustomerTable({ customers, onSelect }: CustomerTableProps) {
  return (
    <table className="hidden w-full border-separate border-spacing-y-3 md:table">
      <thead>
        <tr className="text-left text-kiosk-base text-slate-500">
          <th className="px-4">姓名</th>
          <th className="px-4">電話</th>
          <th className="px-4">身分證字號</th>
          <th className="px-4">顧客編號</th>
          <th className="px-4">區域</th>
          <th className="px-4">分店</th>
          <th className="px-4">建立日期</th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => (
          <tr
            key={customer.id}
            onClick={() => onSelect(customer)}
            className="cursor-pointer rounded-kiosk bg-white text-kiosk-base text-slate-800 shadow-sm hover:bg-kiosk-primary/5"
          >
            <td className="rounded-l-kiosk px-4 py-5 font-semibold">{customer.name}</td>
            <td className="px-4 py-5">{customer.phone ?? '—'}</td>
            <td className="px-4 py-5">{customer.nationalId ?? '—'}</td>
            <td className="px-4 py-5 font-mono">{customer.customerCode ?? '—'}</td>
            <td className="px-4 py-5">{REGION_LABEL[customer.region]}</td>
            <td className="px-4 py-5">{customer.storeName}</td>
            <td className="rounded-r-kiosk px-4 py-5">{formatDate(customer.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
