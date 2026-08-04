'use client';

import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  customerBasicInfoRequireStoreSchema,
  customerBasicInfoWithOptionalStoreSchema,
  customerBasicInfoNonExosomeWithOptionalStoreSchema,
  customerBasicInfoNonExosomeRequireStoreSchema,
  customerDuplicateSearchSchema,
  type CustomerBasicInfoWithOptionalStoreInput,
  type CustomerBasicInfoNonExosomeInput,
  type CustomerDetail,
  type CustomerListItem,
  type StoreSummary,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { createCustomerWithSignature, createQuickCustomer, searchCustomers, signDisclaimer } from '@/lib/customers-api';
import { listStores } from '@/lib/stores-api';
import { useDebouncedValue } from '@/lib/use-debounce';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';
import { KioskSelect } from '../kiosk/KioskSelect';
import { MaskedPhoneInput } from '../kiosk/MaskedInput';
import { SignatureCanvasStep, type SignaturePayload } from './SignatureCanvasStep';
import { StaffSignatureStep } from './StaffSignatureStep';

type WizardStep = 'duplicate-check' | 'basic-info' | 'staff-signature' | 'customer-signature';

interface NewCustomerWizardProps {
  onCreated: (customer: CustomerDetail) => void;
  onClose: () => void;
}

/** 身分證字號的形狀（1個字母+8~9位數字），用來判斷剛剛搜的字串該帶進哪個欄位 */
const NATIONAL_ID_LIKE = /^[A-Za-z]\d{8,9}$/;

function buildStep2Defaults(query: string): Partial<CustomerBasicInfoWithOptionalStoreInput> {
  const trimmed = query.trim();
  if (!trimmed) return {};
  return NATIONAL_ID_LIKE.test(trimmed) ? { nationalId: trimmed.toUpperCase() } : { name: trimmed };
}

function isAdminRole(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin';
}

/**
 * 建檔與簽署的不可分割交易：① 搜尋防重複 → ② 填基本資料（只在 state 暫存，不打 API）
 * → ③ 服務人員簽名（單純畫布，不顯示同意書全文）→ ④ 顧客閱讀同意書全文後在最下方簽名，
 * 按下「確認送出」才把顧客資料 + 兩個簽名打包送出。中途任何一步離開（onClose）都不會留下
 * 任何資料庫紀錄——兩個簽名在送出之前都只存在這個元件的 state 裡，不會分開呼叫兩次 API
 * 提早建立「只簽了一半」的顧客紀錄。
 *
 * 送出當下其實還是依序打兩支 API（後端沒有「一次建檔+雙簽名」的單一端點）：
 * createCustomerWithSignature（建檔＋記服務人員簽名）成功後，緊接著用拿到的顧客 id
 * 呼叫 signDisclaimer（補上顧客簽名）。中間如果第二支失敗，顧客紀錄跟服務人員簽名已經
 * 建立成功，不會整個 rollback——這跟「使用者體感上是一次性動作」與「後端本來就是
 * 兩個各自獨立、可重試的簽署步驟」之間的取捨，失敗時 onCreated 不會被呼叫，
 * 管理員可以從顧客列表找到這筆剛建的紀錄，在詳情頁補簽。
 *
 * 分店欄位是「依登入角色動態出現」的：店長（manager）介面完全不顯示分店選擇，
 * 送出時也不帶 storeId（後端會自動用店長自己的 storeId，見 customers.service.ts 的
 * resolveCreateStore，就算這裡硬塞別的值也會被忽略）；管理員（admin/system_admin）
 * 則必須手動選一間店，這裡用 zod 動態切換 required/optional 來做即時防呆。
 */
export function NewCustomerWizard({ onCreated, onClose }: NewCustomerWizardProps) {
  const [step, setStep] = useState<WizardStep>('duplicate-check');
  const [duplicateQuery, setDuplicateQuery] = useState('');
  const [duplicateError, setDuplicateError] = useState<string>();
  const [candidates, setCandidates] = useState<CustomerListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebouncedValue(duplicateQuery, 400);

  const [user, setUser] = useState<AuthUser>();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesError, setStoresError] = useState<string>();

  const [basicInfo, setBasicInfo] = useState<CustomerBasicInfoWithOptionalStoreInput | CustomerBasicInfoNonExosomeInput>();
  const [isExosomeUser, setIsExosomeUser] = useState(false);
  const [staffSignature, setStaffSignature] = useState<SignaturePayload>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const requireStoreSelect = isAdminRole(user?.role);

  useEffect(() => {
    if (!requireStoreSelect) return;
    let cancelled = false;
    listStores()
      .then((result) => {
        if (!cancelled) setStores(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setStoresError(error instanceof ApiError ? error.message : '載入分店清單失敗，請稍後再試');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requireStoreSelect]);

  const basicInfoSchema = useMemo(() => {
    if (isExosomeUser) {
      return requireStoreSelect ? customerBasicInfoRequireStoreSchema : customerBasicInfoWithOptionalStoreSchema;
    }
    return requireStoreSelect ? customerBasicInfoNonExosomeRequireStoreSchema : customerBasicInfoNonExosomeWithOptionalStoreSchema;
  }, [isExosomeUser, requireStoreSelect]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<any>({
    resolver: zodResolver(basicInfoSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      nationalId: '',
      phone: '',
      address: '',
      line: '',
      email: '',
      note: '',
      storeId: undefined,
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setDuplicateError(undefined);
      const parsed = customerDuplicateSearchSchema.safeParse({ query: debouncedQuery });
      if (!parsed.success) {
        setCandidates([]);
        return;
      }

      setSearching(true);
      try {
        const result = await searchCustomers(parsed.data.query);
        if (!cancelled) setCandidates(result);
      } catch (error) {
        if (!cancelled) {
          setCandidates([]);
          setDuplicateError(error instanceof ApiError ? error.message : '搜尋時系統出了一點問題，請稍後再試');
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  function goToBasicInfo() {
    // 搜尋字串自動聯動：店員剛剛打的字直接帶進對應欄位，不用再打第二次
    reset({
      name: '',
      nationalId: '',
      phone: '',
      address: '',
      line: '',
      email: '',
      note: '',
      storeId: undefined,
      ...buildStep2Defaults(duplicateQuery),
    });
    setStep('basic-info');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmitBasicInfo(values: any) {
    setBasicInfo(values);
    if (isExosomeUser) {
      // 外泌體路徑：繼續簽署流程
      setStep('staff-signature');
    } else {
      // 非外泌體路徑：直接建立（無需簽名）
      setSubmitting(true);
      setSubmitError(undefined);
      try {
        const created = await createQuickCustomer(values);
        onCreated(created);
      } catch (error) {
        setSubmitError(error instanceof ApiError ? error.message : '建立顧客失敗，請稍後再試');
        setSubmitting(false);
      }
    }
  }

  function handleStaffSignatureConfirm(signature: SignaturePayload) {
    setStaffSignature(signature);
    setStep('customer-signature');
  }

  /** 顧客簽完才會真正打 API：先建檔＋記服務人員簽名，成功後緊接著補上顧客簽名，兩者都成功才算完成 */
  async function handleCustomerSignatureConfirm(customerSignature: SignaturePayload) {
    if (!basicInfo || !staffSignature) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const created = await createCustomerWithSignature({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(basicInfo as any),
        isExosomeUser,
        signature: staffSignature,
      });
      await signDisclaimer(created.id, customerSignature);
      onCreated(created);
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '建立顧客失敗，請稍後再試或聯絡管理員');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-kiosk-base text-slate-500">
        <StepBadge active={step === 'duplicate-check'} label="① 確認舊顧客" />
        <span className="text-slate-300">→</span>
        <StepBadge active={step === 'basic-info'} label="② 填寫資料" />
        {isExosomeUser && (
          <>
            <span className="text-slate-300">→</span>
            <StepBadge active={step === 'staff-signature'} label="③ 服務人員簽名" />
            <span className="text-slate-300">→</span>
            <StepBadge active={step === 'customer-signature'} label="④ 顧客簽署同意書" />
          </>
        )}
      </div>

      {step === 'duplicate-check' && (
        <div className="flex flex-1 flex-col gap-4">
          <p className="text-kiosk-base text-slate-600">
            先用姓名或身分證字號查一下，這位顧客是不是已經來過了，避免重複建檔。
          </p>
          <input
            type="search"
            value={duplicateQuery}
            onChange={(event) => setDuplicateQuery(event.target.value)}
            placeholder="輸入姓名或身分證字號"
            aria-label="查詢是否為舊顧客"
            className="min-h-kiosk w-full rounded-kiosk border-4 border-slate-300 bg-white px-6 text-kiosk-lg text-slate-900 outline-none focus:border-kiosk-primary"
          />
          {searching && <p className="text-kiosk-base text-slate-500">搜尋中…</p>}
          {duplicateError && (
            <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
              ⚠️ {duplicateError}
            </p>
          )}

          {candidates.length > 0 && (
            <ul className="flex flex-col gap-3">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="rounded-kiosk border-2 border-amber-300 bg-amber-50 px-5 py-4 text-kiosk-base text-slate-800"
                >
                  找到「{candidate.name}」（{candidate.phone ?? '無電話'} / {candidate.nationalId ?? '無身分證號'}），
                  這位是同一個人嗎？
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex flex-col gap-3">
            <KioskButton variant="primary" fullWidth onClick={goToBasicInfo}>
              確認是新顧客，下一步
            </KioskButton>
            <KioskButton variant="ghost" fullWidth onClick={onClose}>
              取消
            </KioskButton>
          </div>
        </div>
      )}

      {step === 'basic-info' && (
        <form onSubmit={handleSubmit(onSubmitBasicInfo)} className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {requireStoreSelect && (
            <KioskSelect
              label="分店"
              required
              options={stores.map((store) => ({ value: String(store.id), label: `${store.code} ${store.name}` }))}
              placeholder="請選擇要把這位顧客建到哪一家門市"
              errorMessage={(errors.storeId?.message as string | undefined) ?? storesError}
              isValid={Boolean(dirtyFields.storeId) && !errors.storeId}
              {...register('storeId', { valueAsNumber: true })}
            />
          )}
          <KioskInput
            label="姓名"
            required
            placeholder="請輸入顧客姓名"
            errorMessage={errors.name?.message as string | undefined}
            isValid={Boolean(dirtyFields.name) && !errors.name}
            {...register('name')}
          />
          <KioskInput
            label={isExosomeUser ? '身分證字號 *（使用外泌體必填）' : '身分證字號（選填）'}
            required={isExosomeUser}
            placeholder="例如 A123456789"
            errorMessage={errors.nationalId?.message as string | undefined}
            isValid={Boolean(dirtyFields.nationalId) && !errors.nationalId}
            {...register('nationalId')}
          />
          <MaskedPhoneInput
            name="phone"
            control={control}
            label={isExosomeUser ? '電話（選填）' : '電話 *（必填）'}
            errorMessage={errors.phone?.message as string | undefined}
          />
          <KioskInput
            label="住址"
            placeholder="請輸入住址（選填）"
            errorMessage={errors.address?.message as string | undefined}
            isValid={Boolean(dirtyFields.address) && !errors.address}
            {...register('address')}
          />
          <KioskInput
            label="LINE ID"
            placeholder="請輸入 LINE ID（選填）"
            errorMessage={errors.line?.message as string | undefined}
            isValid={Boolean(dirtyFields.line) && !errors.line}
            {...register('line')}
          />
          <KioskInput
            label="Email"
            placeholder="請輸入 Email（選填）"
            errorMessage={errors.email?.message as string | undefined}
            isValid={Boolean(dirtyFields.email) && !errors.email}
            {...register('email')}
          />
          <KioskInput
            label="備註"
            placeholder="請輸入備註（選填）"
            errorMessage={errors.note?.message as string | undefined}
            isValid={Boolean(dirtyFields.note) && !errors.note}
            {...register('note')}
          />

          {/* 外泌體使用者勾選 */}
          <div className="flex items-start gap-3 rounded-kiosk border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              id="is-exosome-user"
              checked={isExosomeUser}
              onChange={(e) => setIsExosomeUser(e.target.checked)}
              className="mt-0.5 h-5 w-5 cursor-pointer accent-kiosk-primary"
            />
            <label htmlFor="is-exosome-user" className="cursor-pointer text-kiosk-base text-amber-800">
              <span className="font-bold">此顧客使用外泌體療程</span>
              <p className="mt-0.5 text-sm">勾選後系統將在 POS 結帳時提醒確認外泌體同意書簽署。</p>
            </label>
          </div>

          {submitError && (
            <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">⚠️ {submitError}</p>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-2">
            <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
              {submitting
                ? '建立中…'
                : isExosomeUser
                  ? '下一步，前往簽署'
                  : '建立顧客'}
            </KioskButton>
            <KioskButton type="button" variant="ghost" fullWidth onClick={() => setStep('duplicate-check')}>
              上一步
            </KioskButton>
          </div>
        </form>
      )}

      {step === 'staff-signature' && (
        <StaffSignatureStep onConfirm={handleStaffSignatureConfirm} onBack={() => setStep('basic-info')} />
      )}

      {step === 'customer-signature' && basicInfo && (
        <SignatureCanvasStep
          customerName={basicInfo.name}
          submitting={submitting}
          errorMessage={submitError}
          onConfirm={handleCustomerSignatureConfirm}
          onBack={() => setStep('staff-signature')}
        />
      )}
    </div>
  );
}

function StepBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-kiosk px-3 py-1 font-semibold ${
        active ? 'bg-kiosk-primary text-white' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {label}
    </span>
  );
}
