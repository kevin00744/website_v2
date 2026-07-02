import type { RestockRequestSummary } from '@website-v2/shared-types';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { formatDate } from '@/lib/format';

interface RestockRequestListProps {
  requests: RestockRequestSummary[];
  /** 有帶這個 prop 才會顯示「標記完成」打勾按鈕——manager 自己看自己提的請求是唯讀的，只有 dealer/admin 能標記完成 */
  onComplete?: (request: RestockRequestSummary) => void;
  completingId?: number;
  /** dealer/admin 看的是跨分店清單，要多顯示「分店」欄；manager 自己只看自己分店，不需要這欄 */
  showStore?: boolean;
}

/** 補貨請求清單：manager/dealer/admin 三種角色共用同一份元件，差別只在有沒有傳 onComplete */
export function RestockRequestList({ requests, onComplete, completingId, showStore }: RestockRequestListProps) {
  if (requests.length === 0) {
    return <p className="text-kiosk-base text-slate-500">目前沒有補貨請求</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {requests.map((request) => (
        <li
          key={request.id}
          className="flex flex-col gap-2 rounded-kiosk border-2 border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-col gap-1">
            <span className="text-kiosk-base font-bold text-slate-900">
              {request.productName} × {request.quantity}
              {showStore && <span className="ml-2 text-sm font-normal text-slate-500">（{request.storeName}）</span>}
            </span>
            {request.note && <span className="text-kiosk-base text-slate-600">備註：{request.note}</span>}
            <span className="text-sm text-slate-400">
              {request.requesterName} 提出於 {formatDate(request.createdAt)}
              {request.isCompleted && request.completedAt && ` · ${request.completedByName ?? ''} 已於 ${formatDate(request.completedAt)} 完成補貨`}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={`rounded-kiosk px-3 py-1 text-kiosk-base font-semibold ${
                request.isCompleted ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {request.isCompleted ? '已完成' : '待補貨'}
            </span>
            {onComplete && !request.isCompleted && (
              <KioskButton variant="primary" onClick={() => onComplete(request)} disabled={completingId === request.id}>
                {completingId === request.id ? '處理中…' : '✓ 標記完成'}
              </KioskButton>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
