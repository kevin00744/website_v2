'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { refundCourseToCredit, type CustomerCourseItem } from '@/lib/customers-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';

interface CourseRefundModalProps {
  open: boolean;
  course: CustomerCourseItem;
  onCompleted: (newStoreCredit: string) => void;
  onClose: () => void;
}

export function CourseRefundModal({ open, course, onCompleted, onClose }: CourseRefundModalProps) {
  const pricePerSession =
    course.purchasePrice != null && course.totalSessions > 0
      ? course.purchasePrice / course.totalSessions
      : null;

  const [sessions, setSessions] = useState(course.remainingSessions.toString());
  const [finalAmount, setFinalAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const sessionsNum = parseInt(sessions, 10);
  const validSessions =
    !isNaN(sessionsNum) && sessionsNum > 0 && sessionsNum <= course.remainingSessions;

  const calculatedAmount =
    validSessions && pricePerSession != null
      ? Math.round(pricePerSession * sessionsNum)
      : null;

  const finalAmountNum = parseFloat(finalAmount);
  const validFinalAmount = !isNaN(finalAmountNum) && finalAmountNum >= 0;

  function handleClose() {
    setSessions(course.remainingSessions.toString());
    setFinalAmount('');
    setRemark('');
    setError(undefined);
    onClose();
  }

  // Auto-fill finalAmount when sessions change
  function handleSessionsChange(v: string) {
    setSessions(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 0 && n <= course.remainingSessions && pricePerSession != null) {
      setFinalAmount(Math.round(pricePerSession * n).toString());
    }
  }

  async function handleSubmit() {
    if (!validSessions) { setError('請輸入有效的退課堂數'); return; }
    if (!validFinalAmount) { setError('請輸入有效的退款金額'); return; }
    setError(undefined);
    setSubmitting(true);
    try {
      const res = await refundCourseToCredit(course.id, {
        refundedSessions: sessionsNum,
        calculatedAmount: calculatedAmount ?? finalAmountNum,
        finalAmount: finalAmountNum,
        remark: remark.trim() || undefined,
      });
      onCompleted(res.newStoreCredit);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '退課失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} title="退課轉儲值金" onClose={handleClose} maxWidthClassName="md:max-w-lg">
      <div className="flex flex-col gap-5 p-1">
        <div className="rounded-kiosk bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">{course.serviceItem.name}</p>
          <p className="mt-1">剩餘堂數：<strong>{course.remainingSessions}</strong> 堂</p>
          {pricePerSession != null && (
            <p>單堂試算價：<strong>${pricePerSession.toLocaleString()}</strong></p>
          )}
        </div>

        <div>
          <KioskInput
            label="退課堂數"
            type="number"
            placeholder={`最多 ${course.remainingSessions} 堂`}
            value={sessions}
            onChange={(e) => handleSessionsChange(e.target.value)}
            errorMessage={
              sessions && !validSessions
                ? `請輸入 1～${course.remainingSessions} 之間的數字`
                : undefined
            }
            isValid={validSessions}
          />
        </div>

        {calculatedAmount != null && (
          <div className="rounded-kiosk border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            系統試算退款：<strong>${calculatedAmount.toLocaleString()}</strong>
          </div>
        )}

        <div>
          <KioskInput
            label="實際轉入儲值金（可調整）"
            type="number"
            placeholder="請輸入金額（元）"
            value={finalAmount}
            onChange={(e) => setFinalAmount(e.target.value)}
            errorMessage={finalAmount && !validFinalAmount ? '請輸入有效金額' : undefined}
            isValid={validFinalAmount}
          />
        </div>

        <div>
          <KioskInput
            label="備註（選填）"
            placeholder="例：顧客要求退課，轉為儲值金"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {error}</p>
        )}

        <div className="flex gap-3">
          <KioskButton variant="ghost" fullWidth onClick={handleClose} disabled={submitting}>
            取消
          </KioskButton>
          <KioskButton
            variant="primary"
            fullWidth
            onClick={() => void handleSubmit()}
            disabled={submitting || !validSessions || !validFinalAmount}
          >
            {submitting ? '處理中…' : '確認退課轉儲值'}
          </KioskButton>
        </div>
      </div>
    </CenteredModal>
  );
}
