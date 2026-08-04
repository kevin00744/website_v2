import type { StoreSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

interface StoreTableProps {
  stores: StoreSummary[];
  onToggleStatus: (store: StoreSummary) => void;
  togglingId?: number;
  canToggleStatus: boolean;
  onDelete?: (store: StoreSummary) => void;
  deletingId?: number;
  onEdit?: (store: StoreSummary) => void;
}

const REGION_LABEL: Record<StoreSummary['region'], string> = {
  north: '北部',
  central: '中部',
  south: '南部',
};

export function StoreTable({ stores, onToggleStatus, togglingId, canToggleStatus, onDelete, deletingId, onEdit }: StoreTableProps) {
  return (
    <table className="hidden w-full border-separate border-spacing-y-3 md:table">
      <thead>
        <tr className="text-left text-kiosk-base text-slate-500">
          <th className="px-4">分店編號</th>
          <th className="px-4">分店名稱</th>
          <th className="px-4">所屬區域</th>
          <th className="px-4">分店電話</th>
          <th className="px-4">地址</th>
          <th className="px-4">狀態</th>
          <th className="px-4" />
        </tr>
      </thead>
      <tbody>
        {stores.map((store) => (
          <tr key={store.id} className="rounded-kiosk bg-white text-kiosk-base text-slate-800 shadow-sm">
            <td className="rounded-l-kiosk px-4 py-5 font-mono font-semibold">{store.code}</td>
            <td className="px-4 py-5 font-semibold">{store.name}</td>
            <td className="px-4 py-5">{REGION_LABEL[store.region]}</td>
            <td className="px-4 py-5">{store.phone ?? '—'}</td>
            <td className="px-4 py-5">{store.address ?? '—'}</td>
            <td className="px-4 py-5">
              <span
                className={`rounded-kiosk px-3 py-1 font-semibold ${
                  store.isActive ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {store.isActive ? '啟用中' : '已停用'}
              </span>
            </td>
            <td className="rounded-r-kiosk px-4 py-5">
              <div className="flex gap-2">
                {onEdit && (
                  <KioskButton variant="secondary" onClick={() => onEdit(store)}>
                    編輯
                  </KioskButton>
                )}
                {canToggleStatus && (
                  <KioskButton
                    variant={store.isActive ? 'ghost' : 'secondary'}
                    onClick={() => onToggleStatus(store)}
                    disabled={togglingId === store.id}
                  >
                    {store.isActive ? '停用' : '啟用'}
                  </KioskButton>
                )}
                {onDelete && (
                  <KioskButton variant="danger" onClick={() => onDelete(store)} disabled={deletingId === store.id}>
                    {deletingId === store.id ? '刪除中…' : '刪除'}
                  </KioskButton>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
