'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getDisclaimerPdfPath, signDisclaimer } from '@/lib/customers-api';
import { formatSignedAt } from '@/lib/format';
import { openPdfInNewTab } from '@/lib/pdf-viewer';
import { KioskButton } from '../kiosk/KioskButton';
import { InlineSignaturePad, type InlineSignaturePayload } from './InlineSignaturePad';

interface DisclaimerSignSectionProps {
  customerId: number;
  disclaimerCustomerSignedAt: string | null;
  disclaimerStaffSignedAt: string | null;
  disclaimerFullySigned: boolean;
  /** 服務人員簽完後通知父層重新抓一次顧客詳情 */
  onChanged: () => void;
}

/**
 * 服務人員那次簽名在建檔當下就已經完成（NewCustomerWizard 的第③步），
 * 這裡只負責「開新視窗看 PDF」+「顧客補簽」這兩件事——順序對調：服務人員先簽、顧客後簽。
 */
export function DisclaimerSignSection({
  customerId,
  disclaimerCustomerSignedAt,
  disclaimerStaffSignedAt,
  disclaimerFullySigned,
  onChanged,
}: DisclaimerSignSectionProps) {
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string>();
  const [showPad, setShowPad] = useState(false);
  const [viewError, setViewError] = useState<string>();

  async function handleViewPdf() {
    setViewError(undefined);
    try {
      await openPdfInNewTab(getDisclaimerPdfPath(customerId));
    } catch (error) {
      setViewError(error instanceof ApiError ? error.message : '開啟 PDF 失敗，請稍後再試');
    }
  }

  async function handleSignConfirm(payload: InlineSignaturePayload) {
    setSigning(true);
    setSignError(undefined);
    try {
      await signDisclaimer(customerId, {
        signatureImageUrl: payload.signatureImageUrl,
        signaturePoints: payload.signaturePoints,
      });
      setShowPad(false);
      onChanged();
    } catch (error) {
      setSignError(error instanceof ApiError ? error.message : '簽署失敗，請稍後再試');
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-kiosk border-2 border-slate-200 p-4">
      <h3 className="text-kiosk-base font-bold text-slate-900">同意書簽署</h3>

      <KioskButton variant="secondary" fullWidth onClick={handleViewPdf}>
        開新視窗查看 PDF（可列印）
      </KioskButton>
      {viewError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {viewError}
        </p>
      )}

      <div
        className={`rounded-kiosk px-4 py-3 text-kiosk-base font-semibold ${
          disclaimerFullySigned ? 'bg-kiosk-success/10 text-kiosk-success' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {disclaimerFullySigned ? '雙方已完成簽署，文件已鎖定不可修改' : '尚未完成雙方簽署'}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-kiosk bg-slate-50 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-kiosk-base font-semibold text-slate-800">服務人員簽名</span>
          <span className="text-kiosk-base text-slate-500">{formatSignedAt(disclaimerStaffSignedAt)}</span>
        </div>
        <span className="text-kiosk-base font-semibold text-kiosk-success" aria-hidden="true">
          ✓ 已簽署
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-kiosk bg-slate-50 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-kiosk-base font-semibold text-slate-800">顧客簽名</span>
          <span className="text-kiosk-base text-slate-500">{formatSignedAt(disclaimerCustomerSignedAt)}</span>
        </div>
        {!disclaimerCustomerSignedAt && (
          <KioskButton variant="secondary" onClick={() => setShowPad(true)} disabled={signing}>
            簽名
          </KioskButton>
        )}
        {disclaimerCustomerSignedAt && (
          <span className="text-kiosk-base font-semibold text-kiosk-success" aria-hidden="true">
            ✓ 已簽署
          </span>
        )}
      </div>

      {showPad && (
        <InlineSignaturePad
          label="請顧客在下方簽名"
          submitting={signing}
          errorMessage={signError}
          onConfirm={handleSignConfirm}
          onCancel={() => setShowPad(false)}
        />
      )}
    </div>
  );
}
