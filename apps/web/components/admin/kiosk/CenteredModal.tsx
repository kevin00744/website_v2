'use client';

import { useEffect } from 'react';

interface CenteredModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 預設關閉，避免門市人員手滑點到背景就把還沒填完的表單關掉、丟掉進度 */
  closeOnOverlayClick?: boolean;
  /**
   * 內容物比較單純（例如純表單，沒有同意書全文閱讀區）時可以縮窄一點，預設仍是 5xl
   * （建立顧客那種「閱讀＋簽名」流程需要最大留白，分店表單這種單純表單用 3xl 就很夠）。
   */
  maxWidthClassName?: string;
}

/**
 * 置中大尺寸彈出層，取代舊的右側 Drawer。
 * 新增顧客緊接著就是免責聲明書全文閱讀＋簽名，需要最寬敞的版面，
 * 不能擠在側邊一條窄窄的面板裡——所以全部裝置（含手機）都用置中、接近全螢幕的卡片，
 * 不再有「桌機側滑、手機才全螢幕」的差異化版面。
 */
export function CenteredModal({
  open,
  onClose,
  title,
  children,
  closeOnOverlayClick = false,
  maxWidthClassName = 'md:max-w-5xl',
}: CenteredModalProps) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-slate-900/60" onClick={closeOnOverlayClick ? onClose : undefined} />
      <div className={`relative flex h-full w-full flex-col bg-white shadow-2xl md:h-[92vh] md:w-[92vw] md:rounded-kiosk ${maxWidthClassName}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <h2 className="text-kiosk-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex min-h-kiosk-sm min-w-kiosk-sm items-center justify-center rounded-kiosk text-kiosk-lg font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6 md:px-10">{children}</div>
      </div>
    </div>
  );
}
