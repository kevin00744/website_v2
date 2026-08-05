'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { signExosomeConsent } from '@/lib/customers-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';
import { InlineSignaturePad, type InlineSignaturePayload } from './InlineSignaturePad';

interface ExosomeBacksignModalProps {
  open: boolean;
  customerId: number;
  customerName: string;
  onCompleted: () => void;
  onClose: () => void;
}

/**
 * 外泌體補簽同意書：單步驟簽名，呼叫 POST /customers/:id/exosome-consent。
 * 與原始雙方簽署流程（ExosomeConsentModal）不同，此補簽僅需顧客簽名一次即完成。
 */
export function ExosomeBacksignModal({
  open,
  customerId,
  customerName,
  onCompleted,
  onClose,
}: ExosomeBacksignModalProps) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setNotes('');
    setError(undefined);
    setSubmitting(false);
    onClose();
  }

  async function handleSign(payload: InlineSignaturePayload) {
    setError(undefined);
    setSubmitting(true);
    try {
      await signExosomeConsent(customerId, {
        signatureUrl: payload.signatureImageUrl,
        signaturePoints: payload.signaturePoints,
        notes: notes.trim() || undefined,
      });
      onCompleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '補簽失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal
      open={open}
      title={`外泌體補簽同意書 — ${customerName}`}
      onClose={handleClose}
      maxWidthClassName="md:max-w-xl"
    >
      <div className="flex flex-col gap-5 p-1">
        <div className="rounded-kiosk border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-semibold">補簽說明</p>
          <p className="mt-1">
            此顧客已是外泌體使用者，請引導顧客在下方完成補簽，系統將記錄簽署時間與簽名圖像作為存證。
          </p>
        </div>

        <KioskInput
          label="備註（選填）"
          placeholder="例：顧客確認閱讀同意書後補簽"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {error}
          </p>
        )}

        <InlineSignaturePad
          label="顧客簽名"
          submitting={submitting}
          errorMessage={error}
          onConfirm={handleSign}
          onCancel={handleClose}
        />
      </div>
    </CenteredModal>
  );
}
