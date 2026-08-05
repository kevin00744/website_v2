import type { StoreSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';

interface StoreCardListProps {
  stores: StoreSummary[];
  onToggleStatus: (store: StoreSummary) => void;
  togglingId?: number;
  canToggleStatus: boolean;
  onDelete?: (store: StoreSummary) => void;
  deletingId?: number;
  onEdit?: (store: StoreSummary) => void;
}

const REGION_LABEL: Record<StoreSummary['region'], string> = {
  A: '北部',
  B: '中部',
  C: '南部',
};

/** 手機版（<768px）：卡片式列表，重點突出編號與名稱，表格在小螢幕擠成一團很難點 */
export function StoreCardList({ stores, onToggleStatus, togglingId, canToggleStatus, onDelete, deletingId, onEdit }: StoreCardListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {stores.map((store) => (
        <li key={store.id} className="flex flex-col gap-3 rounded-kiosk bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-kiosk-lg font-bold text-kiosk-primary">{store.code}</span>
              <span className="text-kiosk-lg font-bold text-slate-900">{store.name}</span>
              <span className="text-kiosk-base text-slate-500">
                {REGION_LABEL[store.region]} · {store.phone ?? '尚未填寫電話'}
              </span>
            </div>
            <span
              className={`shrink-0 rounded-kiosk px-3 py-1 text-kiosk-base font-semibold ${
                store.isActive ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {store.isActive ? '啟用中' : '已停用'}
            </span>
          </div>
          <div className="flex gap-2">
            {onEdit && (
              <KioskButton variant="secondary" fullWidth onClick={() => onEdit(store)}>
                編輯
              </KioskButton>
            )}
            {canToggleStatus && (
              <KioskButton
                variant={store.isActive ? 'ghost' : 'secondary'}
                fullWidth
                onClick={() => onToggleStatus(store)}
                disabled={togglingId === store.id}
              >
                {store.isActive ? '停用' : '啟用'}
              </KioskButton>
            )}
            {onDelete && (
              <KioskButton variant="danger" fullWidth onClick={() => onDelete(store)} disabled={deletingId === store.id}>
                {deletingId === store.id ? '刪除中…' : '刪除'}
              </KioskButton>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
