'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { KioskButton } from '../kiosk/KioskButton';
import type { SignaturePayload } from './SignatureCanvasStep';

interface StaffSignatureStepProps {
  onConfirm: (payload: SignaturePayload) => void;
  onBack: () => void;
}

/** 簽名軌跡至少要有這麼多筆觸座標，跟後端 MIN_SIGNATURE_POINTS 對齊 */
const MIN_SIGNATURE_POINTS = 10;

/**
 * 建檔流程的第一個簽署步驟：單純只給服務人員簽名，不顯示同意書全文——
 * 同意書全文跟簽名欄位留給下一步（顧客那一步，見 SignatureCanvasStep.tsx），這裡只是
 * 服務人員確認「我準備好要幫這位顧客建檔了」的簡單簽名，畫面故意做得很單純，不用滑動找東西。
 * 這一步簽好的簽名先存在 NewCustomerWizard 的 state 裡，等顧客那一步也簽完才會一起送出。
 */
export function StaffSignatureStep({ onConfirm, onBack }: StaffSignatureStepProps) {
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
    onConfirm({
      signatureImageUrl: pad.getTrimmedCanvas().toDataURL('image/png'),
      signaturePoints: points,
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h3 className="text-kiosk-lg font-bold text-slate-900">服務人員簽名確認</h3>
        <p className="text-kiosk-base text-slate-600">請服務人員先簽名，確認準備好要為這位顧客建檔。下一步會請顧客閱讀同意書全文並簽名。</p>
      </div>

      <div className="rounded-kiosk border-4 border-slate-300 bg-white" style={{ touchAction: 'none' }}>
        <SignatureCanvas ref={padRef} canvasProps={{ className: 'h-72 w-full rounded-kiosk' }} minWidth={2} maxWidth={4} />
      </div>

      {localError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {localError}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <KioskButton variant="primary" fullWidth onClick={handleConfirm}>
          下一步，請顧客簽署同意書
        </KioskButton>
        <KioskButton variant="ghost" fullWidth onClick={handleClear}>
          重簽
        </KioskButton>
        <KioskButton variant="ghost" fullWidth onClick={onBack}>
          上一步
        </KioskButton>
      </div>
    </div>
  );
}
