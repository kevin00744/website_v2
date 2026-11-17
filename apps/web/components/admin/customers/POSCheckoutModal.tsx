'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import {
  listServiceItems,
  listStoreStaff,
  createServiceRecord,
  type ServiceItemSummary,
  type StoreStaffSummary,
  type ConsumptionType,
  type PaymentMethod,
} from '@/lib/service-records-api';
import {
  listPromotionPlans,
  purchasePromotionPlan,
  type PromotionPlan,
} from '@/lib/promotion-plans-api';
import {
  listCustomerCourses,
  getCustomerWallet,
  topUpCustomerWallet,
  type CustomerCourseItem,
  type CustomerWalletInfo,
} from '@/lib/customers-api';
import { CenteredModal } from '../kiosk/CenteredModal';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskSelect } from '../kiosk/KioskSelect';
import { InlineSignaturePad } from './InlineSignaturePad';
import { AdjustQuickPicks } from './AdjustQuickPicks';

/** 套裝方案堂數 ± 步進器（觸控友善） */
function Stepper({ value, min, onChange, suffix }: { value: number; min: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label="減少"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-300 text-2xl font-bold text-slate-700 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-16 text-center text-xl font-bold tabular-nums text-slate-900">
        {value} <span className="text-sm font-semibold text-slate-500">{suffix}</span>
      </span>
      <button
        type="button"
        aria-label="增加"
        onClick={() => onChange(Math.min(999, value + 1))}
        className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-kiosk-primary bg-kiosk-primary/5 text-2xl font-bold text-kiosk-primary"
      >
        ＋
      </button>
    </div>
  );
}

interface POSCheckoutModalProps {
  open: boolean;
  storeId: number;
  customerId: number;
  customerName: string;
  isExosomeUser: boolean;
  disclaimerFullySigned: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

type Step = 'items' | 'payment' | 'signature' | 'success';
/** 消費模式：單次服務 / 購買套裝方案 / 直接儲值 */
type PurchaseMode = 'service' | 'promotion' | 'top_up';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '現金',
  transfer: '轉帳',
  line_pay: 'LINE Pay',
  credit_card: '信用卡',
};

const CONSUMPTION_TYPE_LABELS: Record<ConsumptionType, string> = {
  single_purchase: '單次消費（現場付款）',
  wallet_deduction: '扣儲值金',
  course_deduction: '扣課程堂數',
};

export function POSCheckoutModal({
  open,
  storeId,
  customerId,
  customerName,
  isExosomeUser,
  disclaimerFullySigned,
  onClose,
  onCompleted,
}: POSCheckoutModalProps) {
  const [step, setStep] = useState<Step>('items');
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>('service');

  const [serviceItems, setServiceItems] = useState<ServiceItemSummary[]>();
  const [promotionPlans, setPromotionPlans] = useState<PromotionPlan[]>();
  const [staff, setStaff] = useState<StoreStaffSummary[]>();
  const [customerCourses, setCustomerCourses] = useState<CustomerCourseItem[]>();
  /** 開啟時預先載入的所有課程摘要（banner 顯示用） */
  const [allCourses, setAllCourses] = useState<CustomerCourseItem[]>();
  const [walletInfo, setWalletInfo] = useState<CustomerWalletInfo>();
  // 直接儲值欄位
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpPaymentMethod, setTopUpPaymentMethod] = useState<PaymentMethod>('cash');
  const [loadError, setLoadError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<AuthUser>();

  // Step 1 選擇（共用）
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [step1Error, setStep1Error] = useState<string>();

  // Step 2 付款（服務模式）
  const [consumptionType, setConsumptionType] = useState<ConsumptionType>('single_purchase');
  /** course_deduction 時選擇的 serviceItemId（合併後），以字串儲存 */
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [sessionsDeducted, setSessionsDeducted] = useState('1');
  /** 多重支付：每筆 { method, amount } */
  const [splitPayments, setSplitPayments] = useState<{ method: PaymentMethod; amount: string }[]>([{ method: 'cash', amount: '' }]);
  // 結帳時調整（單次消費 / 扣儲值：只能改金額；套裝方案：金額 + 堂數 / 贈送金額）
  const [adjustedAmount, setAdjustedAmount] = useState(0);
  const [adjustNote, setAdjustNote] = useState('');
  // Step 2 付款（套裝方案模式）
  const [planPaymentMethod, setPlanPaymentMethod] = useState<PaymentMethod>('cash');
  const [planBonus, setPlanBonus] = useState(0);
  /** 套裝方案各品項調整後的堂數（key = serviceItemId） */
  const [planSessions, setPlanSessions] = useState<Record<number, number>>({});
  const [step2Error, setStep2Error] = useState<string>();

  const [successSummary, setSuccessSummary] = useState<{ itemName: string; staffName: string; amount: string; adjustNote?: string }>();
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const needsSignature = purchaseMode === 'service' && (consumptionType === 'wallet_deduction' || consumptionType === 'course_deduction');
  // 外泌體顧客必須先完成同意書雙方簽署才能結帳（同意書已統一成一份）
  const exosomeBlocked = isExosomeUser && !disclaimerFullySigned;

  const selectedItem = serviceItems?.find((i) => String(i.id) === selectedItemId);
  const selectedPlan = promotionPlans?.find((p) => String(p.id) === selectedPlanId);
  const selectedStaffMember = staff?.find((s) => String(s.id) === selectedStaffId);

  useEffect(() => { setUser(getAuthUser()); }, []);

  useEffect(() => {
    if (!open) {
      setStep('items');
      setPurchaseMode('service');
      setSelectedItemId('');
      setSelectedPlanId('');
      setSelectedStaffId('');
      setConsumptionType('single_purchase');
      setSplitPayments([{ method: 'cash', amount: '' }]);
      setAdjustedAmount(0);
      setAdjustNote('');
      setPlanPaymentMethod('cash');
      setPlanBonus(0);
      setPlanSessions({});
      setSessionsDeducted('1');
      setSelectedCourseId('');
      setCustomerCourses(undefined);
      setAllCourses(undefined);
      setWalletInfo(undefined);
      setTopUpAmount('');
      setTopUpPaymentMethod('cash');
      setStep1Error(undefined);
      setStep2Error(undefined);
      setSubmitError(undefined);
      setSubmitting(false);
      setSuccessSummary(undefined);
      clearTimeout(successTimerRef.current);
      return;
    }

    setLoadError(undefined);
    Promise.all([
      listServiceItems(storeId),
      listStoreStaff(storeId),
      listPromotionPlans(storeId),
      listCustomerCourses(customerId).catch(() => []),
      getCustomerWallet(customerId).catch(() => ({ balance: 0, bonusBalance: 0, total: 0 })),
    ])
      .then(([items, staffList, plans, courses, wallet]) => {
        setServiceItems(items);
        setStaff(staffList);
        setPromotionPlans(plans);
        setAllCourses(courses);
        setWalletInfo(wallet);
        if (user?.id) {
          const me = staffList.find((s) => s.id === user.id);
          if (me) setSelectedStaffId(String(me.id));
        }
      })
      .catch(() => setLoadError('載入資料失敗，請關閉後重新開啟'));
  }, [open, storeId, user?.id]);

  // ── Step 1 → Step 2 ───────────────────────────────────────────────────────

  function handleStep1Next() {
    if (purchaseMode === 'service' && !selectedItemId) { setStep1Error('請選擇服務項目'); return; }
    if (purchaseMode === 'promotion' && !selectedPlanId) { setStep1Error('請選擇促銷方案'); return; }
    // top_up 直接跳 payment（不需要選服務項目）
    setStep1Error(undefined);
    // 進入付款步驟時，調整欄位一律從原價 / 原方案開始
    resetAdjustments();
    setStep('payment');
  }

  function resetAdjustments() {
    setAdjustNote('');
    if (purchaseMode === 'promotion' && selectedPlan) {
      setAdjustedAmount(selectedPlan.price);
      setPlanBonus(selectedPlan.bonusAmount ?? 0);
      setPlanSessions(Object.fromEntries(selectedPlan.items.map((i) => [i.serviceItem.id, i.sessions])));
    } else {
      setAdjustedAmount(selectedItem?.price ?? 0);
    }
  }

  /** 套裝方案：和原方案的差異（自動帶入備註，例如「臉部保養 10→12 堂」） */
  const planDiffTokens = (() => {
    if (purchaseMode !== 'promotion' || !selectedPlan) return [] as string[];
    const tokens: string[] = [];
    if (selectedPlan.type === 'course_bundle') {
      for (const i of selectedPlan.items) {
        const now = planSessions[i.serviceItem.id] ?? i.sessions;
        if (now !== i.sessions) tokens.push(`${i.serviceItem.name} ${i.sessions}→${now} 堂`);
      }
    } else if (planBonus !== (selectedPlan.bonusAmount ?? 0)) {
      tokens.push(`贈送 $${(selectedPlan.bonusAmount ?? 0).toLocaleString()}→$${planBonus.toLocaleString()}`);
    }
    return tokens;
  })();
  const planTokensKey = planDiffTokens.join('|');
  // useMemo 讓 AdjustQuickPicks 的 autoTokens 參考穩定，避免每次 render 重算備註
  const stablePlanTokens = useMemo(() => planDiffTokens, [planTokensKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 按 serviceItemId 合併同一服務品項的多張課程（A+B 套裝各含相同品項時顯示合計）
  const mergedCourses = customerCourses
    ? Object.values(
        customerCourses.reduce(
          (acc, c) => {
            const key = c.serviceItem.id;
            if (!acc[key]) {
              acc[key] = { ...c, totalSessions: 0, usedSessions: 0, remainingSessions: 0 };
            }
            acc[key].totalSessions += c.totalSessions;
            acc[key].usedSessions += c.usedSessions;
            acc[key].remainingSessions += c.remainingSessions;
            return acc;
          },
          {} as Record<number, CustomerCourseItem>,
        ),
      )
    : undefined;

  // 切換消費方式時重置支付欄位
  async function handleConsumptionTypeChange(ct: ConsumptionType) {
    setConsumptionType(ct);
    setSplitPayments([{ method: 'cash', amount: '' }]);
    setAdjustedAmount(selectedItem?.price ?? 0);
    setAdjustNote('');
    setSelectedCourseId('');
    setStep2Error(undefined);
    if (ct === 'course_deduction' && !customerCourses) {
      setCustomerCourses(allCourses ?? []);
    }
  }

  // 多重支付輔助
  const itemPrice = selectedItem?.price ?? 0;
  /** 單次消費應付 / 扣儲值實扣：結帳時調整後的金額 */
  const effectivePrice = Math.max(0, adjustedAmount);
  const splitTotal = splitPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const splitRemaining = effectivePrice - splitTotal;

  function updateSplit(idx: number, field: 'method' | 'amount', value: string) {
    setSplitPayments((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }
  function addSplit() {
    setSplitPayments((prev) => [...prev, { method: 'transfer', amount: splitRemaining > 0 ? String(splitRemaining) : '' }]);
  }
  function removeSplit(idx: number) {
    setSplitPayments((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Step 2 → Step 3 / 直接結帳 ───────────────────────────────────────────

  function handleStep2Next() {
    setStep2Error(undefined);

    if (purchaseMode === 'top_up') {
      const amount = Number(topUpAmount);
      if (!amount || amount <= 0) { setStep2Error('請輸入正確的儲值金額'); return; }
      void handleTopUpCheckout();
      return;
    }

    if (purchaseMode === 'promotion') {
      void handlePromotionCheckout();
      return;
    }

    if (consumptionType === 'single_purchase') {
      // 實收 0 元（全額折抵）不需要付款方式
      if (effectivePrice > 0) {
        // 驗證：多重支付總和必須等於調整後的應付金額
        if (splitPayments.some((p) => !p.amount || Number(p.amount) <= 0)) {
          setStep2Error('每筆付款金額必須填寫'); return;
        }
        if (splitTotal !== effectivePrice) {
          setStep2Error(`付款總和 $${splitTotal} 與應付金額 $${effectivePrice} 不符，請調整`); return;
        }
      }
      void handleServiceCheckout();
      return;
    }
    if (consumptionType === 'wallet_deduction') {
      if (effectivePrice <= 0) { setStep2Error('扣款金額必須大於 0'); return; }
      if (walletInfo && effectivePrice > walletInfo.total) {
        setStep2Error(`儲值金餘額不足（剩 $${walletInfo.total.toLocaleString()}）`); return;
      }
    }
    if (consumptionType === 'course_deduction') {
      if (!selectedCourseId) { setStep2Error('請選擇要扣除的課程'); return; }
      if (!Number(sessionsDeducted) || Number(sessionsDeducted) < 1) { setStep2Error('扣除堂數至少為 1'); return; }
      const course = mergedCourses?.find((c) => String(c.serviceItem.id) === selectedCourseId);
      if (course && Number(sessionsDeducted) > course.remainingSessions) {
        setStep2Error(`此課程剩餘 ${course.remainingSessions} 堂，超過可扣堂數`); return;
      }
    }
    setStep('signature');
  }

  // ── 直接儲值（無優惠）──────────────────────────────────────────────────────

  async function handleTopUpCheckout() {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const result = await topUpCustomerWallet(customerId, Number(topUpAmount), topUpPaymentMethod);
      setWalletInfo({ balance: result.balance, bonusBalance: result.bonusBalance, total: result.balance + result.bonusBalance });
      setSuccessSummary({
        itemName: '直接儲值',
        staffName: selectedStaffMember?.name ?? '—',
        amount: `儲入 $${Number(topUpAmount).toLocaleString()} 元（本金餘額 $${result.balance.toLocaleString()}）`,
      });
      setStep('success');
      successTimerRef.current = setTimeout(onCompleted, 2500);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : '儲值失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  // ── 套裝方案結帳 ──────────────────────────────────────────────────────────

  async function handlePromotionCheckout() {
    if (!selectedPlan) return;
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const isBundle = selectedPlan.type === 'course_bundle';
      const items = selectedPlan.items.map((i) => ({
        serviceItemId: i.serviceItem.id,
        sessions: planSessions[i.serviceItem.id] ?? i.sessions,
      }));
      await purchasePromotionPlan(storeId, selectedPlan.id, {
        customerId,
        staffId: selectedStaffId ? Number(selectedStaffId) : undefined,
        paymentMethod: planPaymentMethod,
        price: adjustedAmount,
        ...(isBundle ? { items } : { bonusAmount: planBonus }),
        adjustNote: adjustNote || undefined,
      });

      const summaryLine = !isBundle
        ? `儲值 $${adjustedAmount.toLocaleString()} 元，贈 $${planBonus.toLocaleString()} 元`
        : `派發 ${selectedPlan.items.map((i) => `${i.serviceItem.name}×${planSessions[i.serviceItem.id] ?? i.sessions}`).join('、')}`;
      const priceNote = adjustedAmount !== selectedPlan.price
        ? `原價 $${selectedPlan.price.toLocaleString()} → 實收 $${adjustedAmount.toLocaleString()}`
        : `$${adjustedAmount.toLocaleString()} 元`;

      setSuccessSummary({
        itemName: selectedPlan.name,
        staffName: selectedStaffMember?.name ?? '（服務人員）',
        amount: `${summaryLine}｜${priceNote}`,
        adjustNote: adjustNote || undefined,
      });
      setStep('success');
      successTimerRef.current = setTimeout(onCompleted, 2500);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : '結帳失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  // ── 單次服務結帳 ──────────────────────────────────────────────────────────

  async function handleServiceCheckout(customerSignatureUrl?: string) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      // course_deduction 時，serviceItemId 從選中的合併課程取得；後端自動從最舊有餘堂的課程扣
      const selectedMergedCourse = mergedCourses?.find((c) => String(c.serviceItem.id) === selectedCourseId);
      const serviceItemId =
        consumptionType === 'course_deduction'
          ? (selectedMergedCourse?.serviceItem.id ?? 0)
          : Number(selectedItemId);

      await createServiceRecord(storeId, {
        customerId,
        staffId: selectedStaffId ? Number(selectedStaffId) : undefined,
        serviceItemId,
        consumptionType,
        // single_purchase / wallet_deduction：金額＝結帳時調整後的金額
        amountPaid: consumptionType === 'course_deduction' ? undefined : effectivePrice,
        payments: consumptionType === 'single_purchase'
          ? (effectivePrice > 0 ? splitPayments.map((p) => ({ method: p.method as PaymentMethod, amount: Number(p.amount) })) : [])
          : undefined,
        sessionsDeducted: consumptionType === 'course_deduction' ? Number(sessionsDeducted) : undefined,
        // 不傳 customerCourseId：後端依 serviceItemId 找最舊有剩餘堂數的課程
        customerSignatureUrl,
        adjustNote: consumptionType !== 'course_deduction' && adjustNote ? adjustNote : undefined,
      });

      const deductedCourse = selectedMergedCourse;
      const paymentSummary = consumptionType === 'wallet_deduction'
        ? `扣儲值 $${effectivePrice.toLocaleString()} 元`
        : effectivePrice === 0
          ? '$0 元（全額折抵）'
          : splitPayments.length === 1
            ? `$${effectivePrice.toLocaleString()} 元（${PAYMENT_METHOD_LABELS[splitPayments[0].method]}）`
            : splitPayments.map((p) => `${PAYMENT_METHOD_LABELS[p.method as PaymentMethod]} $${Number(p.amount).toLocaleString()}`).join(' ＋ ');
      const amountDisplay =
        consumptionType === 'course_deduction'
          ? `${deductedCourse?.serviceItem.name ?? '課程'} 扣 ${sessionsDeducted} 堂（剩 ${(deductedCourse?.remainingSessions ?? 0) - Number(sessionsDeducted)} 堂）`
          : effectivePrice !== itemPrice
            ? `${paymentSummary}｜原價 $${itemPrice.toLocaleString()}`
            : paymentSummary;

      setSuccessSummary({
        itemName: consumptionType === 'course_deduction' ? (deductedCourse?.serviceItem.name ?? '（課程）') : (selectedItem?.name ?? '（項目）'),
        staffName: selectedStaffMember?.name ?? '（服務人員）',
        amount: amountDisplay,
        adjustNote: consumptionType !== 'course_deduction' && adjustNote ? adjustNote : undefined,
      });
      setStep('success');
      successTimerRef.current = setTimeout(onCompleted, 2500);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : '結帳失敗，請稍後再試');
      if (needsSignature) setStep('payment');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── 渲染 ─────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <CenteredModal open={open} title="POS 結帳" onClose={onClose} maxWidthClassName="md:max-w-2xl">
        <p className="p-4 text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>
      </CenteredModal>
    );
  }

  return (
    <CenteredModal open={open} title={`POS 結帳 — ${customerName}`} onClose={step === 'success' ? onCompleted : onClose} maxWidthClassName="md:max-w-2xl">
      <div className="flex flex-col gap-6 p-1">

        {/* ── Step 1：消費項目選擇 ── */}
        {step === 'items' && (
          <>
            {/* 顧客資訊 Banner：錢包餘額 + 課程摘要 */}
            <div className="rounded-kiosk bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-500">顧客</span>
              <p className="text-kiosk-lg font-bold text-slate-900">{customerName}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {walletInfo !== undefined && (
                  <span className={`text-sm font-semibold ${walletInfo.total > 0 ? 'text-kiosk-primary' : 'text-slate-400'}`}>
                    💳 儲值金 ${walletInfo.balance.toLocaleString()}
                    {walletInfo.bonusBalance > 0 && <span className="ml-1 text-slate-400">+ 贈 ${walletInfo.bonusBalance.toLocaleString()}</span>}
                  </span>
                )}
                {allCourses !== undefined && allCourses.length > 0 && (
                  <span className="text-sm font-semibold text-green-600">
                    📚 課程：{allCourses.map((c) => `${c.serviceItem.name} ×${c.remainingSessions}`).join('、')}
                  </span>
                )}
                {allCourses !== undefined && allCourses.length === 0 && walletInfo?.total === 0 && (
                  <span className="text-sm text-slate-400">尚無儲值金與課程</span>
                )}
              </div>
            </div>

            {exosomeBlocked && (
              <div className="rounded-kiosk border-2 border-amber-400 bg-amber-50 p-4">
                <p className="text-kiosk-base font-semibold text-amber-800">
                  ⚠️ 此顧客已標記為外泌體使用者，但尚未完成同意書簽署。
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  請先至顧客基本資料頁補齊身分證字號，並完成同意書雙方簽名，再進行結帳。
                </p>
              </div>
            )}

            {/* 消費模式切換 */}
            <div className="flex gap-1 rounded-kiosk bg-slate-100 p-1">
              {([
                { mode: 'service', label: '服務 / 扣點' },
                { mode: 'promotion', label: '套裝方案' },
                { mode: 'top_up', label: '直接儲值' },
              ] as { mode: PurchaseMode; label: string }[]).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setPurchaseMode(mode); setStep1Error(undefined); }}
                  className={`flex-1 rounded-kiosk py-2 text-sm font-semibold transition-colors ${
                    purchaseMode === mode
                      ? 'bg-white text-kiosk-primary shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 服務模式：選服務項目 */}
            {purchaseMode === 'service' && (
              !serviceItems ? (
                <p className="text-kiosk-base text-slate-400">載入服務項目中…</p>
              ) : serviceItems.length === 0 ? (
                <p className="text-kiosk-base text-slate-400">目前尚無服務項目。</p>
              ) : (
                <KioskSelect
                  label="服務項目"
                  required
                  placeholder="請選擇服務項目…"
                  options={serviceItems.map((i) => ({
                    value: String(i.id),
                    label: `${i.name}　$${i.price.toLocaleString()} 元${i.isOutsourced ? '（外包）' : ''}`,
                  }))}
                  value={selectedItemId}
                  onChange={(e) => { setSelectedItemId(e.target.value); setStep1Error(undefined); }}
                  errorMessage={step1Error}
                  isValid={Boolean(selectedItemId)}
                />
              )
            )}

            {/* 直接儲值模式：不需選項目，直接下一步填金額 */}
            {purchaseMode === 'top_up' && (
              <div className="rounded-kiosk border border-kiosk-primary/30 bg-kiosk-primary/5 p-4 text-kiosk-base text-kiosk-primary">
                直接儲值至顧客本金帳戶，無贈送金，下一步填入金額與付款方式。
              </div>
            )}

            {/* 套裝方案模式：選促銷方案 */}
            {purchaseMode === 'promotion' && (
              !promotionPlans ? (
                <p className="text-kiosk-base text-slate-400">載入促銷方案中…</p>
              ) : promotionPlans.length === 0 ? (
                <p className="rounded-kiosk bg-slate-50 p-4 text-kiosk-base text-slate-500">
                  目前尚無促銷方案，請先至「促銷方案管理」建立。
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-kiosk-base font-bold text-slate-800">
                    促銷方案 <span className="text-kiosk-danger">*</span>
                  </label>
                  {promotionPlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => { setSelectedPlanId(String(plan.id)); setStep1Error(undefined); }}
                      className={`rounded-kiosk border-2 p-4 text-left transition-all ${
                        selectedPlanId === String(plan.id)
                          ? 'border-kiosk-primary bg-kiosk-primary/5'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-kiosk-base font-bold text-slate-900">{plan.name}</p>
                        <p className="text-kiosk-base font-bold text-kiosk-primary">
                          ${plan.price.toLocaleString()}
                        </p>
                      </div>
                      {plan.type === 'top_up_bonus' && (
                        <p className="mt-1 text-sm text-slate-500">
                          儲值優惠 — 贈送 ${plan.bonusAmount?.toLocaleString()} 儲值金
                        </p>
                      )}
                      {plan.type === 'course_bundle' && plan.items.length > 0 && (
                        <p className="mt-1 text-sm text-slate-500">
                          課程套組 — {plan.items.map((i) => `${i.serviceItem.name}×${i.sessions}`).join('、')}
                        </p>
                      )}
                    </button>
                  ))}
                  {step1Error && (
                    <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {step1Error}</p>
                  )}
                </div>
              )
            )}

            {/* 服務人員（共用） */}
            {staff && (
              <KioskSelect
                label="服務人員"
                placeholder="請選擇服務人員…"
                options={staff.map((s) => ({ value: String(s.id), label: s.name }))}
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
              />
            )}

            <div className="flex justify-end pt-2">
              <KioskButton
                variant="primary"
                onClick={handleStep1Next}
                disabled={exosomeBlocked || (!serviceItems && !promotionPlans)}
              >
                {exosomeBlocked ? '需先完成同意書簽署' : '下一步 →'}
              </KioskButton>
            </div>
          </>
        )}

        {/* ── Step 2：付款方式 ── */}
        {step === 'payment' && (
          <>
            {/* 摘要 */}
            <div className="rounded-kiosk bg-slate-50 px-4 py-3">
              {purchaseMode === 'service' ? (
                <>
                  <p className="text-sm text-slate-500">服務項目</p>
                  <p className="text-kiosk-lg font-bold text-slate-900">{selectedItem?.name}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500">購買套裝方案</p>
                  <p className="text-kiosk-lg font-bold text-slate-900">{selectedPlan?.name}</p>
                  <p className="text-kiosk-base font-semibold text-kiosk-primary">
                    ${selectedPlan?.price.toLocaleString()} 元
                  </p>
                </>
              )}
              <p className="text-sm text-slate-500 mt-1">服務人員：{selectedStaffMember?.name ?? '（未選擇）'}</p>
            </div>

            {/* 直接儲值 */}
            {purchaseMode === 'top_up' && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-kiosk-base font-bold text-slate-800">儲值金額（元）*</label>
                  <input
                    type="number" min={1} value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    placeholder="例：1000"
                    className="min-h-kiosk w-full rounded-kiosk border-4 border-slate-300 bg-white px-5 text-kiosk-base outline-none focus:border-kiosk-primary"
                  />
                  {walletInfo !== undefined && (
                    <p className="text-sm text-slate-500">
                      目前本金餘額：${walletInfo.balance.toLocaleString()}，儲值後將增加至 ${(walletInfo.balance + Number(topUpAmount || 0)).toLocaleString()}
                    </p>
                  )}
                </div>
                <KioskSelect
                  label="支付方式" required
                  options={Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  value={topUpPaymentMethod}
                  onChange={(e) => setTopUpPaymentMethod(e.target.value as PaymentMethod)}
                />
              </>
            )}

            {/* 服務模式的消費方式 */}
            {purchaseMode === 'service' && (
              <>
                <KioskSelect
                  label="消費方式"
                  required
                  options={Object.entries(CONSUMPTION_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  value={consumptionType}
                  onChange={(e) => void handleConsumptionTypeChange(e.target.value as ConsumptionType)}
                />
                {consumptionType === 'single_purchase' && (
                  <div className="flex flex-col gap-3">
                    {/* 原價 + 調整（快速選單：打折 / 折價券 / 折抵），只能改金額 */}
                    <AdjustQuickPicks
                      listPrice={itemPrice}
                      amount={adjustedAmount}
                      onAmountChange={setAdjustedAmount}
                      onNoteChange={setAdjustNote}
                      amountLabel="應付金額"
                      resetKey={`single-${selectedItemId}`}
                    />

                    {effectivePrice > 0 && (<>
                    {/* 多重支付列表 */}
                    <label className="text-kiosk-base font-bold text-slate-800">付款方式 *</label>
                    {splitPayments.map((pay, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {/* 付款方式按鈕 */}
                        <div className="flex flex-1 flex-wrap gap-1">
                          {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([m, label]) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => updateSplit(idx, 'method', m)}
                              className={`rounded-kiosk px-3 py-2 text-sm font-semibold transition-colors ${
                                pay.method === m
                                  ? 'bg-kiosk-primary text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="number" min={1}
                          value={pay.amount}
                          onChange={(e) => updateSplit(idx, 'amount', e.target.value)}
                          placeholder="金額"
                          className="w-28 rounded-kiosk border-2 border-slate-300 px-3 py-2 text-kiosk-base outline-none focus:border-kiosk-primary"
                        />
                        {splitPayments.length > 1 && (
                          <button type="button" onClick={() => removeSplit(idx)} className="text-kiosk-danger text-sm font-bold">✕</button>
                        )}
                      </div>
                    ))}

                    {/* 合計 & 差額提示 */}
                    <div className={`flex items-center justify-between rounded-kiosk px-4 py-2 text-sm font-semibold ${
                      splitTotal === effectivePrice ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      <span>已填：${splitTotal.toLocaleString()}</span>
                      {splitTotal < effectivePrice && <span>差額：${splitRemaining.toLocaleString()}</span>}
                      {splitTotal === effectivePrice && <span>✓ 金額一致</span>}
                      {splitTotal > effectivePrice && <span>⚠ 超過 ${(splitTotal - effectivePrice).toLocaleString()}</span>}
                    </div>

                    {splitPayments.length < 4 && splitTotal < effectivePrice && (
                      <button type="button" onClick={addSplit} className="text-sm text-kiosk-primary underline">
                        ＋ 新增另一種付款方式（差額 ${splitRemaining.toLocaleString()}）
                      </button>
                    )}
                    </>)}
                  </div>
                )}
                {consumptionType === 'wallet_deduction' && (
                  <div className="flex flex-col gap-2">
                    <AdjustQuickPicks
                      listPrice={itemPrice}
                      amount={adjustedAmount}
                      onAmountChange={setAdjustedAmount}
                      onNoteChange={setAdjustNote}
                      amountLabel="實扣儲值金"
                      resetKey={`wallet-${selectedItemId}`}
                    />
                    <p className="text-sm text-slate-600">
                      儲值金餘額 ${walletInfo?.total.toLocaleString() ?? '—'}（本金不足時自動扣抵贈送金）
                    </p>
                  </div>
                )}
                {consumptionType === 'course_deduction' && (
                  <div className="flex flex-col gap-3">
                    {/* 顧客持有課程選擇器（按服務品項合併顯示） */}
                    <div className="flex flex-col gap-2">
                      <label className="text-kiosk-base font-bold text-slate-800">選擇要扣除的課程 *</label>
                      {!mergedCourses ? (
                        <p className="text-kiosk-base text-slate-400">載入顧客課程中…</p>
                      ) : mergedCourses.length === 0 ? (
                        <p className="rounded-kiosk border border-amber-200 bg-amber-50 p-3 text-kiosk-base text-amber-700">
                          ⚠️ 此顧客名下目前沒有可用的課程堂數。
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {mergedCourses.map((course) => (
                            <button
                              key={course.serviceItem.id}
                              type="button"
                              onClick={() => setSelectedCourseId(String(course.serviceItem.id))}
                              className={`rounded-kiosk border-2 p-3 text-left transition-all ${
                                selectedCourseId === String(course.serviceItem.id)
                                  ? 'border-kiosk-primary bg-kiosk-primary/5'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-kiosk-base font-semibold text-slate-900">
                                  {course.serviceItem.name}
                                </p>
                                <span className="text-kiosk-base font-bold text-kiosk-primary">
                                  剩 {course.remainingSessions} 堂
                                </span>
                              </div>
                              <p className="text-sm text-slate-400">
                                已用 {course.usedSessions} / 共 {course.totalSessions} 堂
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* 扣除堂數 */}
                    {selectedCourseId && (
                      <div className="flex flex-col gap-2">
                        <label className="text-kiosk-base font-bold text-slate-800">本次扣除堂數 *</label>
                        <input
                          type="number" min={1}
                          max={mergedCourses?.find((c) => String(c.serviceItem.id) === selectedCourseId)?.remainingSessions ?? 99}
                          value={sessionsDeducted}
                          onChange={(e) => setSessionsDeducted(e.target.value)}
                          className="min-h-kiosk w-full rounded-kiosk border-4 border-slate-300 bg-white px-5 text-kiosk-base outline-none focus:border-kiosk-primary"
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 套裝方案：可調整堂數 / 贈送金額與實收金額 */}
            {purchaseMode === 'promotion' && selectedPlan && (
              <>
                <div className="flex flex-col gap-3 rounded-kiosk border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-600">方案內容（可調整）</p>
                  {selectedPlan.type === 'course_bundle' &&
                    selectedPlan.items.map((i) => {
                      const now = planSessions[i.serviceItem.id] ?? i.sessions;
                      const changed = now !== i.sessions;
                      return (
                        <div key={i.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-kiosk-base font-semibold text-slate-900">{i.serviceItem.name}</p>
                            {changed && <p className="text-sm font-semibold text-amber-700">原 {i.sessions} 堂 → {now} 堂</p>}
                          </div>
                          <Stepper
                            value={now}
                            min={1}
                            onChange={(v) => setPlanSessions((prev) => ({ ...prev, [i.serviceItem.id]: v }))}
                            suffix="堂"
                          />
                        </div>
                      );
                    })}
                  {selectedPlan.type === 'top_up_bonus' && (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-kiosk-base font-semibold text-slate-900">贈送儲值金</p>
                        {planBonus !== (selectedPlan.bonusAmount ?? 0) && (
                          <p className="text-sm font-semibold text-amber-700">
                            原 ${(selectedPlan.bonusAmount ?? 0).toLocaleString()} → ${planBonus.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-500">$</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={planBonus}
                          onChange={(e) => setPlanBonus(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                          className="h-12 w-32 rounded-kiosk border-2 border-slate-300 px-3 text-lg font-bold outline-none focus:border-kiosk-primary"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <AdjustQuickPicks
                  listPrice={selectedPlan.price}
                  amount={adjustedAmount}
                  onAmountChange={setAdjustedAmount}
                  onNoteChange={setAdjustNote}
                  autoTokens={stablePlanTokens}
                  resetKey={`plan-${selectedPlanId}`}
                />
                <KioskSelect
                  label="支付方式" required
                  options={Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  value={planPaymentMethod}
                  onChange={(e) => setPlanPaymentMethod(e.target.value as PaymentMethod)}
                />
              </>
            )}

            {(step2Error || submitError) && (
              <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
                ⚠️ {step2Error ?? submitError}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <KioskButton variant="ghost" onClick={() => { setStep('items'); setSubmitError(undefined); }}>
                ← 上一步
              </KioskButton>
              <KioskButton variant="primary" fullWidth onClick={handleStep2Next} disabled={submitting}>
                {submitting
                  ? '處理中…'
                  : purchaseMode === 'top_up'
                    ? '確認儲值'
                    : purchaseMode === 'promotion' || consumptionType === 'single_purchase'
                      ? '確認結帳'
                      : '下一步 →（顧客簽名）'}
              </KioskButton>
            </div>
          </>
        )}

        {/* ── Step 3：電子簽名（僅服務模式 wallet/course）── */}
        {step === 'signature' && (
          <>
            <div className="rounded-kiosk bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-500">本次消費</p>
              <p className="text-kiosk-lg font-bold text-slate-900">
                {consumptionType === 'course_deduction'
                  ? `${mergedCourses?.find((c) => String(c.serviceItem.id) === selectedCourseId)?.serviceItem.name ?? '課程'} — 扣 ${sessionsDeducted} 堂`
                  : `${selectedItem?.name}　扣儲值 $${effectivePrice.toLocaleString()} 元`}
              </p>
              <p className="text-sm text-slate-500">顧客：{customerName}</p>
            </div>
            <InlineSignaturePad
              label="請顧客確認消費明細並在下方簽名"
              submitting={submitting}
              errorMessage={submitError}
              onConfirm={({ signatureImageUrl }) => void handleServiceCheckout(signatureImageUrl)}
              onCancel={() => { setStep('payment'); setSubmitError(undefined); }}
            />
          </>
        )}

        {/* ── Step 4：成功 ── */}
        {step === 'success' && successSummary && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-kiosk-success text-5xl text-white shadow-lg">
              ✓
            </div>
            <div className="text-center">
              <p className="text-kiosk-xl font-bold text-slate-900">結帳完成</p>
              <p className="mt-2 text-kiosk-base text-slate-600">{successSummary.itemName}</p>
              <p className="text-kiosk-base font-semibold text-kiosk-primary">{successSummary.amount}</p>
              {successSummary.adjustNote && (
                <p className="mt-1 text-sm font-semibold text-amber-700">調整備註：{successSummary.adjustNote}</p>
              )}
              <p className="text-sm text-slate-500">服務人員：{successSummary.staffName}</p>
            </div>
            <p className="text-sm text-slate-400">視窗即將自動關閉…</p>
            <KioskButton variant="secondary" onClick={onCompleted}>立即關閉</KioskButton>
          </div>
        )}
      </div>
    </CenteredModal>
  );
}
