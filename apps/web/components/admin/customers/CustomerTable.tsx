import type { CustomerListItem } from '@website-v2/shared-types';
import { formatDate, formatPhone } from '@/lib/format';

interface CustomerTableProps {
  customers: CustomerListItem[];
  onSelect: (customer: CustomerListItem) => void;
}

/** iPad/桌機版（≥768px）：資料表格。手機版隱藏，改用 CustomerCardList。單一門市使用，不顯示分店/區域欄位。 */
export function CustomerTable({ customers, onSelect }: CustomerTableProps) {
  return (
    <table className="hidden w-full border-separate border-spacing-y-3 md:table">
      <thead>
        <tr className="text-left text-kiosk-base text-slate-500">
          <th className="px-4">姓名</th>
          <th className="px-4">電話</th>
          <th className="px-4">身分證字號</th>
          <th className="px-4">顧客編號</th>
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
            <td className="px-4 py-5">{formatPhone(customer.phone) ?? '—'}</td>
            <td className="px-4 py-5">{customer.nationalId ?? '—'}</td>
            <td className="px-4 py-5 font-mono">{customer.customerCode ?? '—'}</td>
            <td className="rounded-r-kiosk px-4 py-5">{formatDate(customer.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
