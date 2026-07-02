'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { KioskButton } from '../kiosk/KioskButton';

export interface InlineSignaturePayload {
  signatureImageUrl: string;
  signaturePoints: { x: number; y: number }[];
}

interface InlineSignaturePadProps {
  label: string;
  submitting: boolean;
  errorMessage?: string;
  onConfirm: (payload: InlineSignaturePayload) => void;
  onCancel: () => void;
}

/** 簽名軌跡至少要有這麼多筆觸座標，跟後端 MIN_SIGNATURE_POINTS 對齊 */
const MIN_SIGNATURE_POINTS = 10;

/** 文件雙簽署用的簡化簽名板（沒有同意書條款內容，純粹就是簽名 + 確認/取消） */
export function InlineSignaturePad({ label, submitting, errorMessage, onConfirm, onCancel }: InlineSignaturePadProps) {
  const padRef = useRef<SignatureCanvas>(null);
  const [localError, setLocalError] = useState<string>();

  function handleClear() {
    padRef.current?.clear();
    setLocalError(undefined);
  }

  function handleConfirm() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setLocalError('沒有偵測到簽名，請在框框裡簽名後再按確認');
      return;
    }
    const points = pad.toData().flatMap((stroke) => stroke.map((point) => ({ x: point.x, y: point.y })));
    if (points.length < MIN_SIGNATURE_POINTS) {
      setLocalError('簽名看起來太小或太短，請重新簽一次完整的簽名');
      return;
    }
    setLocalError(undefined);
    onConfirm({ signatureImageUrl: pad.getTrimmedCanvas().toDataURL('image/png'), signaturePoints: points });
  }

  return (
    <div className="flex flex-col gap-3 rounded-kiosk border-2 border-slate-200 bg-slate-50 p-4">
      <p className="text-kiosk-base font-bold text-slate-800">{label}</p>
      <div className="rounded-kiosk border-4 border-slate-300 bg-white" style={{ touchAction: 'none' }}>
        <SignatureCanvas ref={padRef} canvasProps={{ className: 'h-40 w-full rounded-kiosk' }} minWidth={2} maxWidth={4} />
      </div>
      {(localError || errorMessage) && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {localError ?? errorMessage}
        </p>
      )}
      <div className="flex gap-3">
        <KioskButton variant="primary" fullWidth onClick={handleConfirm} disabled={submitting}>
          {submitting ? '送出中…' : '確認簽名'}
        </KioskButton>
        <KioskButton variant="ghost" fullWidth onClick={handleClear} disabled={submitting}>
          重簽
        </KioskButton>
        <KioskButton variant="ghost" fullWidth onClick={onCancel} disabled={submitting}>
          取消
        </KioskButton>
      </div>
    </div>
  );
}
