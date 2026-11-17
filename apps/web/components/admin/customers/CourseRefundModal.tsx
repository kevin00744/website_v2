'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  getCourseRefundQuote,
  refundCourseCash,
  refundCourseToCredit,
  type CourseRefundQuote,
  type CustomerCourseItem,
} from '@/lib/customers-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { AdjustQuickPicks } from './AdjustQuickPicks';

type Mode = 'cash' | 'credit';
type PaymentMethod = 'cash' | 'transfer' | 'line_pay' | 'credit_card';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: '現金',
  transfer: '轉帳',
  line_pay: 'LINE Pay',
  credit_card: '信用卡',
};

interface CourseRefundModalProps {
  open: boolean;
  course: CustomerCourseItem;
  /** cash：退費（退錢給顧客）；credit：退課轉儲值金（存進 POS 用的儲值金錢包） */
  mode: Mode;
  onCompleted: () => void;
  onClose: () => void;
}

/**
 * 課程退費 / 退課轉儲值：先選要退的剩餘堂數，試算 = 單堂價 × 堂數，
 * 下面和結帳一樣用快速選單（打折 / 折價券 / 折抵）或直接填寫實際金額。
 */
export function CourseRefundModal({ open, course, mode, onCompleted, onClose }: CourseRefundModalProps) {
  const [quote, setQuote] = useState<CourseRefundQuote>();
  const [loadError, setLoadError] = useState<string>();
  const [sessions, setSessions] = useState(course.remainingSessions);
  const [unitPrice, setUnitPrice] = useState(0);
  const [editingUnit, setEditingUnit] = useState(false);
  const [amount, setAmount] = useState(0);
  const [adjustNote, setAdjustNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const remaining = quote?.remaining ?? course.remainingSessions;
  const calculated = Math.round(unitPrice * sessions);
  const title = mode === 'cash' ? '課程退費' : '退課轉儲值金';

  useEffect(() => {
    if (!open) return;
    setLoadError(undefined);
    setConfirming(false);
    setError(undefined);
    getCourseRefundQuote(course.id)
      .then((q) => {
        setQuote(q);
        setSessions(q.remaining);
        setUnitPrice(q.unitPrice);
        setAmount(Math.round(q.unitPrice * q.remaining));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : '載入課程資料失敗'));
  }, [open, course.id]);

  // 堂數或單堂價改變 → 實際金額回到新的試算（快速選單也會重設）
  useEffect(() => {
    setAmount(calculated);
  }, [calculated]);

  async function submit() {
    setError(undefined);
    if (sessions < 1 || sessions > remaining) return setError(`退回堂數必須介於 1 至 ${remaining} 之間`);
    if (!Number.isInteger(amount) || amount < 0) return setError('請輸入正確的金額');
    setSubmitting(true);
    try {
      const payload = {
        refundedSessions: sessions,
        calculatedAmount: calculated,
        finalAmount: amount,
        adjustNote: adjustNote || undefined,
      };
      if (mode === 'cash') await refundCourseCash(course.id, { ...payload, paymentMethod });
      else await refundCourseToCredit(course.id, payload);
      onCompleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `${title}失敗，請稍後再試`);
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} title={title} onClose={onClose} maxWidthClassName="md:max-w-xl">
      {loadError ? (
        <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>
      ) : !quote ? (
        <p className="text-kiosk-base text-slate-500">載入中…</p>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          {/* 課程資訊 */}
          <div className="rounded-kiosk bg-slate-50 p-4">
            <p className="text-kiosk-lg font-bold text-slate-900">{quote.serviceItem.name}</p>
            <p className="mt-1 text-base text-slate-700">
              共 {quote.totalSessions} 堂・已用 {quote.usedSessions} 堂・<strong className="text-slate-900">剩 {quote.remaining} 堂</strong>
            </p>
          </div>

          {/* 退回堂數 */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-kiosk-base font-bold text-slate-800">退回堂數</p>
              <p className="text-sm text-slate-600">最多 {remaining} 堂</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="減少"
                disabled={sessions <= 1}
                onClick={() => setSessions((s) => Math.max(1, s - 1))}
                className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-300 text-2xl font-bold text-slate-700 disabled:opacity-30"
              >
                −
              </button>
              <span className="w-16 text-center text-xl font-bold tabular-nums text-slate-900">
                {sessions} <span className="text-sm font-semibold text-slate-500">堂</span>
              </span>
              <button
                type="button"
                aria-label="增加"
                disabled={sessions >= remaining}
                onClick={() => setSessions((s) => Math.min(remaining, s + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-kiosk-primary bg-kiosk-primary/5 text-2xl font-bold text-kiosk-primary disabled:opacity-30"
              >
                ＋
              </button>
              <button
                type="button"
                onClick={() => setSessions(remaining)}
                className="ml-1 h-12 rounded-xl px-3 text-sm font-bold text-kiosk-primary hover:bg-kiosk-primary/10"
              >
                全部
              </button>
            </div>
          </div>

          {/* 單堂價（可修改） */}
          <div className="rounded-kiosk border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-600">單堂價</p>
                <p className="text-sm text-slate-600">{quote.basis}</p>
              </div>
              {editingUnit ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-slate-500">$</span>
                  <input
                    autoFocus
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    onBlur={() => setEditingUnit(false)}
                    className="h-12 w-28 rounded-xl border-2 border-kiosk-primary px-3 text-lg font-bold outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingUnit(true)}
                  className="rounded-xl px-3 py-2 text-lg font-bold text-slate-900 hover:bg-slate-100"
                >
                  ${unitPrice.toLocaleString()} <span className="text-sm font-semibold text-kiosk-primary">修改</span>
                </button>
              )}
            </div>
            <p className="mt-2 border-t border-slate-100 pt-2 text-base text-slate-700">
              試算：${unitPrice.toLocaleString()} × {sessions} 堂 = <strong className="text-slate-900">${calculated.toLocaleString()}</strong>
            </p>
          </div>

          {/* 打折 / 折價券 / 折抵 / 自行填寫 */}
          <AdjustQuickPicks
            listPrice={calculated}
            amount={amount}
            onAmountChange={setAmount}
            onNoteChange={setAdjustNote}
            amountLabel={mode === 'cash' ? '實退金額' : '轉入儲值金'}
            resetKey={`${sessions}-${unitPrice}`}
          />

          {mode === 'cash' && (
            <div>
              <p className="mb-2 text-kiosk-base font-bold text-slate-800">退款方式</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    aria-pressed={paymentMethod === m}
                    className={`min-h-[3rem] rounded-xl border-2 text-base font-bold ${
                      paymentMethod === m ? 'border-kiosk-primary bg-kiosk-primary text-white' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {PAYMENT_LABEL[m]}
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && <p className="mt-2 text-sm text-slate-600">現金退款會從備用金扣除。</p>}
            </div>
          )}

          {confirming && (
            <div className="rounded-kiosk border-2 border-amber-300 bg-amber-50 p-4 text-base font-semibold text-amber-900">
              {mode === 'cash'
                ? `確認退 ${sessions} 堂、實退 $${amount.toLocaleString()}（${PAYMENT_LABEL[paymentMethod]}${paymentMethod === 'cash' ? '，從備用金扣除' : ''}）？`
                : `確認退 ${sessions} 堂，轉入儲值金 $${amount.toLocaleString()}？`}
              {adjustNote && <p className="mt-1 text-sm font-normal">備註：{adjustNote}</p>}
            </div>
          )}

          {error && (
            <p className="text-base font-semibold text-kiosk-danger" role="alert">
              ⚠️ {error}
            </p>
          )}

          <div className="mt-auto flex justify-end gap-3 border-t border-slate-200 pt-4">
            <KioskButton variant="ghost" onClick={confirming ? () => setConfirming(false) : onClose} disabled={submitting}>
              {confirming ? '返回修改' : '取消'}
            </KioskButton>
            {confirming ? (
              <KioskButton variant="danger" onClick={() => void submit()} disabled={submitting}>
                {submitting ? '處理中…' : mode === 'cash' ? '確認退費' : '確認轉儲值'}
              </KioskButton>
            ) : (
              <KioskButton onClick={() => setConfirming(true)}>下一步</KioskButton>
            )}
          </div>
        </div>
      )}
    </CenteredModal>
  );
}
