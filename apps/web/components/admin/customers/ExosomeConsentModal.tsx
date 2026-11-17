'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { signStaffDisclaimer, signDisclaimer, fillNationalId } from '@/lib/customers-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';
import { InlineSignaturePad, type InlineSignaturePayload } from './InlineSignaturePad';
import { SignatureCanvasStep, type SignaturePayload } from './SignatureCanvasStep';

interface ExosomeConsentModalProps {
  open: boolean;
  customerId: number;
  customerName: string;
  /** 顧客目前的身分證字號（若為 null 則先強制補填） */
  nationalId: string | null;
  onCompleted: () => void;
  onClose: () => void;
}

type Step = 'fill-id' | 'staff-sig' | 'customer-sig';

/**
 * 同意書雙方簽署流程（事後補簽版本）：
 * [若無身分證] ① 補填身分證字號
 * ② 服務人員確認並簽名 → `POST /customers/:id/disclaimer/sign-staff`
 * ③ 顧客閱讀完整條款並簽名 → `POST /customers/:id/disclaimer/sign`
 */
export function ExosomeConsentModal({
  open,
  customerId,
  customerName,
  nationalId: initialNationalId,
  onCompleted,
  onClose,
}: ExosomeConsentModalProps) {
  const needsId = !initialNationalId;

  const [step, setStep] = useState<Step>(needsId ? 'fill-id' : 'staff-sig');
  const [idInput, setIdInput] = useState('');
  const [idError, setIdError] = useState<string>();
  const [idSubmitting, setIdSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function resetAndClose() {
    setStep(needsId ? 'fill-id' : 'staff-sig');
    setIdInput('');
    setIdError(undefined);
    setError(undefined);
    setSubmitting(false);
    setIdSubmitting(false);
    onClose();
  }

  // ─── Step 0：補填身分證字號 ──────────────────────────────────────────────

  async function handleFillId() {
    setIdError(undefined);
    const trimmed = idInput.trim().toUpperCase();
    if (!/^[A-Z]\d{9}$/.test(trimmed)) {
      setIdError('身分證字號格式不正確，例如 A123456789');
      return;
    }
    setIdSubmitting(true);
    try {
      await fillNationalId(customerId, trimmed);
      setStep('staff-sig');
    } catch (err) {
      setIdError(err instanceof ApiError ? err.message : '補填失敗，請稍後再試');
    } finally {
      setIdSubmitting(false);
    }
  }

  // ─── Step 1：服務人員簽名 ────────────────────────────────────────────────

  async function handleStaffSig(payload: InlineSignaturePayload) {
    setError(undefined);
    setSubmitting(true);
    try {
      await signStaffDisclaimer(customerId, {
        signatureImageUrl: payload.signatureImageUrl,
        signaturePoints: payload.signaturePoints,
      });
      setStep('customer-sig');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '服務人員簽名失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Step 2：顧客簽名 ────────────────────────────────────────────────────

  async function handleCustomerSig(payload: SignaturePayload) {
    setError(undefined);
    setSubmitting(true);
    try {
      await signDisclaimer(customerId, {
        signatureImageUrl: payload.signatureImageUrl,
        signaturePoints: payload.signaturePoints,
      });
      onCompleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '顧客簽名失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── 步驟標示 ─────────────────────────────────────────────────────────────

  const steps = needsId
    ? [
        { key: 'fill-id', label: '① 補填身分證' },
        { key: 'staff-sig', label: '② 服務人員簽名' },
        { key: 'customer-sig', label: '③ 顧客簽署' },
      ]
    : [
        { key: 'staff-sig', label: '① 服務人員簽名' },
        { key: 'customer-sig', label: '② 顧客簽署' },
      ];

  return (
    <CenteredModal
      open={open}
      title={`同意書簽署 — ${customerName}`}
      onClose={resetAndClose}
      maxWidthClassName="md:max-w-2xl"
    >
      <div className="flex flex-col gap-4 p-1">
        {/* 步驟標示 */}
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((s, i) => (
            <span key={s.key} className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                step === s.key ? 'bg-kiosk-primary text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ))}
        </div>

        {/* Step 0：補填身分證字號 */}
        {step === 'fill-id' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-kiosk border-2 border-amber-300 bg-amber-50 p-4">
              <p className="text-kiosk-base font-bold text-amber-800">⚠️ 需先補填身分證字號</p>
              <p className="mt-1 text-sm text-amber-700">
                同意書需要顧客身分證字號作為存證資料，請先補填後再進行簽署。
              </p>
            </div>
            <KioskInput
              label="身分證字號"
              required
              placeholder="例如 A123456789"
              value={idInput}
              onChange={(e) => { setIdInput(e.target.value.toUpperCase()); setIdError(undefined); }}
              errorMessage={idError}
              isValid={/^[A-Z]\d{9}$/.test(idInput.trim())}
            />
            <div className="flex gap-3">
              <KioskButton variant="ghost" onClick={resetAndClose} fullWidth disabled={idSubmitting}>取消</KioskButton>
              <KioskButton variant="primary" onClick={() => void handleFillId()} fullWidth disabled={idSubmitting}>
                {idSubmitting ? '儲存中…' : '確認補填，進入簽署'}
              </KioskButton>
            </div>
          </div>
        )}

        {/* Step 1：服務人員簽名 */}
        {step === 'staff-sig' && (
          <>
            <p className="text-sm text-slate-500">
              請服務人員確認顧客資料無誤後在下方簽名，確認後系統將自動建立同意書 PDF。
            </p>
            {error && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>}
            <InlineSignaturePad
              label="服務人員簽名確認"
              submitting={submitting}
              errorMessage={error}
              onConfirm={handleStaffSig}
              onCancel={resetAndClose}
            />
          </>
        )}

        {/* Step 2：顧客簽名 */}
        {step === 'customer-sig' && (
          <>
            {error && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>}
            <SignatureCanvasStep
              customerName={customerName}
              submitting={submitting}
              errorMessage={error}
              onConfirm={handleCustomerSig}
              onBack={() => {
                if (window.confirm('服務人員已完成簽名，確定要關閉嗎？顧客簽名可稍後在詳情頁補填。')) {
                  onCompleted(); // 重新載入以顯示服務人員已簽的狀態
                }
              }}
            />
          </>
        )}
      </div>
    </CenteredModal>
  );
}
