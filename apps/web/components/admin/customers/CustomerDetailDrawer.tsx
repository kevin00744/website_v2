'use client';

import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { customerUpdateSchema, type CustomerDetail, type CustomerUpdateInput } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import {
  deleteCustomer,
  getCustomerDetail,
  getDisclaimerPdfPath,
  getExosomeConsentPdfPath,
  listCustomerCourses,
  updateCustomer,
  type CustomerCourseItem,
} from '@/lib/customers-api';
import { openPdfInNewTab } from '@/lib/pdf-viewer';
import { formatPhone } from '@/lib/format';
import { KioskButton } from '../kiosk/KioskButton';
import { KioskInput } from '../kiosk/KioskInput';
import { MaskedPhoneInput } from '../kiosk/MaskedInput';
import { DisclaimerSignSection } from './DisclaimerSignSection';
import { ExosomeConsentModal } from './ExosomeConsentModal';
import { TreatmentRecordTab } from './TreatmentRecordTab';
import { NewTreatmentModal } from './NewTreatmentModal';
import { POSCheckoutModal } from './POSCheckoutModal';
import { CourseRefundModal } from './CourseRefundModal';
import { CourseConvertModal } from './CourseConvertModal';
import { LineBindingBadge } from '../line/LineBindingBadge';

interface CustomerDetailDrawerProps {
  customerId: number;
  onUpdated: (detail: CustomerDetail) => void;
  onDeleted: () => void;
}

type Tab = 'profile' | 'treatments' | 'courses';

/** 對齊後端 InventoryController 的 @Roles('manager')：admin/system_admin/manager 才能記錄商品使用 */
function canConsumeInventory(role: AuthUser['role'] | undefined): boolean {
  return role === 'admin' || role === 'system_admin' || role === 'manager' || role === 'staff';
}

/**
 * 對齊後端 CustomersController 的 DELETE :id 路由 @Roles('manager')：店長/管理員/系統管理員可刪。
 * 顧客還有未用完課程或儲值金時，後端會再限制只有系統管理員能刪。
 */
function canDeleteCustomer(role: AuthUser['role'] | undefined): boolean {
  return role === 'manager' || role === 'admin' || role === 'system_admin';
}

/** 退課轉儲值 / 課程轉換 限 manager 以上 */
function canManageCourses(role: AuthUser['role'] | undefined): boolean {
  return role === 'manager' || role === 'admin' || role === 'system_admin';
}

/**
 * 點開單一顧客才看到的完整內容。
 * 姓名/身分證字號只用純文字顯示（終身鎖定，不放進可編輯表單），
 * 其餘選填欄位走 react-hook-form + customerUpdateSchema，送出打 PATCH。
 */
export function CustomerDetailDrawer({ customerId, onUpdated, onDeleted }: CustomerDetailDrawerProps) {
  const [detail, setDetail] = useState<CustomerDetail>();
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('profile');
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [treatmentKey, setTreatmentKey] = useState(0);
  const [posModalOpen, setPosModalOpen] = useState(false);
  const [exosomeModalOpen, setExosomeModalOpen] = useState(false);
  const [exosomePdfError, setExosomePdfError] = useState<string>();
  const [disclaimerPdfError, setDisclaimerPdfError] = useState<string>();
  const [user, setUser] = useState<AuthUser>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [courses, setCourses] = useState<CustomerCourseItem[]>();
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [refundCourse, setRefundCourse] = useState<CustomerCourseItem>();
  const [convertCourse, setConvertCourse] = useState<CustomerCourseItem>();

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<CustomerUpdateInput>({
    resolver: zodResolver(customerUpdateSchema),
    mode: 'onChange',
    defaultValues: { phone: '', address: '', line: '', email: '', note: '' },
  });

  const loadDetail = useCallback(async () => {
    try {
      const result = await getCustomerDetail(customerId);
      setDetail(result);
      reset({
        // DB 存純數字，表單（0000-000-000 格式驗證）帶入時加回 dash
        phone: formatPhone(result.phone) ?? '',
        address: result.address ?? '',
        line: result.line ?? '',
        email: result.email ?? '',
        note: result.note ?? '',
      });
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : '載入顧客資料失敗，請稍後再試');
    }
  }, [customerId, reset]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function loadCourses() {
    setCoursesLoading(true);
    try {
      const list = await listCustomerCourses(customerId);
      setCourses(list);
    } catch {
      // silently swallow — error visible in tab UI
    } finally {
      setCoursesLoading(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    if (!window.confirm(`確定要刪除顧客「${detail.name}」嗎？\n\n刪除後 3 天內可以在顧客資料頁的「最近刪除」還原，超過 3 天就無法還原。`)) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteCustomer(customerId);
      onDeleted();
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : '刪除顧客失敗，請稍後再試');
    } finally {
      setDeleting(false);
    }
  }

  async function onSubmit(values: CustomerUpdateInput) {
    setSaveError(undefined);
    setSaved(false);
    try {
      const updated = await updateCustomer(customerId, values);
      setDetail(updated);
      setSaved(true);
      onUpdated(updated);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : '更新失敗，請稍後再試');
    }
  }

  if (loadError) {
    return (
      <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
        ⚠️ {loadError}
      </p>
    );
  }

  if (!detail) {
    return <p className="text-kiosk-base text-slate-500">載入中…</p>;
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* 終身鎖定的核心識別個資：純文字顯示，沒有任何輸入框 */}
      <div className="rounded-kiosk bg-slate-50 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-kiosk-base text-slate-500">姓名（不可修改）</span>
          <span className="text-kiosk-lg font-bold text-slate-900">{detail.name}</span>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <span className="text-kiosk-base text-slate-500">身分證字號（不可修改）</span>
          <span className="text-kiosk-lg font-bold text-slate-900">{detail.nationalId}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <KioskButton variant={tab === 'profile' ? 'primary' : 'secondary'} onClick={() => setTab('profile')}>
            基本資料
          </KioskButton>
          <KioskButton variant={tab === 'treatments' ? 'primary' : 'secondary'} onClick={() => setTab('treatments')}>
            使用紀錄
          </KioskButton>
          <KioskButton
            variant={tab === 'courses' ? 'primary' : 'secondary'}
            onClick={() => { setTab('courses'); if (!courses) void loadCourses(); }}
          >
            課程管理
          </KioskButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {canConsumeInventory(user?.role) && (
            <>
              <a
                href={`/calendar?customerId=${customerId}`}
                className="inline-flex min-h-kiosk items-center rounded-kiosk border-2 border-kiosk-primary bg-white px-8 text-kiosk-base font-bold text-kiosk-primary hover:bg-kiosk-primary/5"
              >
                📅 預約
              </a>
              <KioskButton variant="secondary" onClick={() => setPosModalOpen(true)}>
                ＋ POS 結帳
              </KioskButton>
              <KioskButton variant="secondary" onClick={() => { setTreatmentModalOpen(true); setTab('treatments'); }}>
                ＋ 紀錄商品使用
              </KioskButton>
            </>
          )}
          {canDeleteCustomer(user?.role) && (
            <KioskButton variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? '刪除中…' : '刪除顧客'}
            </KioskButton>
          )}
        </div>
      </div>

      {deleteError && (
        <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
          ⚠️ {deleteError}
        </p>
      )}

      {tab === 'profile' && (
        <>
          {/* LINE 綁定狀態：除了會計以外都看得到（對齊後端 LineAdminController） */}
          {user && user.role !== 'accountant' && <LineBindingBadge customerId={detail.id} />}

          {/* 儲值金餘額 */}
          {parseFloat(detail.storeCredit) > 0 && (
            <div className="rounded-kiosk border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-blue-700">
                儲值金餘額：<strong className="text-blue-900">${parseFloat(detail.storeCredit).toLocaleString()}</strong>
              </p>
            </div>
          )}

          {/* 外泌體同意書區塊：依顧客狀態顯示不同 UI */}
          {!detail.isExosomeUser ? (
            /* 未勾選外泌體：顯示「外泌體同意書」按鈕，取代簽署區塊 */
            <div className="rounded-kiosk border border-slate-200 bg-slate-50 p-4">
              <p className="text-kiosk-base font-semibold text-slate-700">外泌體同意書</p>
              <p className="mt-1 text-sm text-slate-500">
                若此顧客開始使用外泌體療程，請點擊下方按鈕完成雙方簽署，系統將自動標記並產生聲明書 PDF。
              </p>
              <div className="mt-3">
                <KioskButton variant="secondary" onClick={() => setExosomeModalOpen(true)}>
                  外泌體同意書（開始簽署）
                </KioskButton>
              </div>
            </div>
          ) : detail.hasExosomeConsent ? (
            /* 外泌體補簽同意書已完成 */
            <div className="rounded-kiosk border border-green-200 bg-green-50 p-4">
              <p className="text-kiosk-base font-semibold text-green-700">✓ 外泌體補簽同意書已完成</p>
              {detail.exosomeConsentSignedAt && (
                <p className="mt-1 text-sm text-green-600">
                  簽署日期：{new Date(detail.exosomeConsentSignedAt).toLocaleDateString('zh-TW')}
                </p>
              )}
              <div className="mt-3">
                <KioskButton
                  variant="secondary"
                  onClick={async () => {
                    setExosomePdfError(undefined);
                    try {
                      await openPdfInNewTab(getExosomeConsentPdfPath(customerId));
                    } catch (err) {
                      setExosomePdfError(err instanceof Error ? err.message : '開啟 PDF 失敗，請稍後再試');
                    }
                  }}
                >
                  開新視窗查看同意書 PDF
                </KioskButton>
              </div>
              {exosomePdfError && (
                <p className="mt-2 text-sm font-semibold text-kiosk-danger">⚠️ {exosomePdfError}</p>
              )}
            </div>
          ) : detail.disclaimerFullySigned ? (
            /* 已完整簽署（原始簽署流程）→ 直接顯示 PDF */
            <div className="rounded-kiosk border border-green-200 bg-green-50 p-4">
              <p className="text-kiosk-base font-semibold text-green-700">✓ 外泌體同意書已完成雙方簽署</p>
              <div className="mt-3">
                <KioskButton
                  variant="secondary"
                  onClick={async () => {
                    setDisclaimerPdfError(undefined);
                    try {
                      await openPdfInNewTab(getDisclaimerPdfPath(customerId));
                    } catch (err) {
                      setDisclaimerPdfError(err instanceof Error ? err.message : '開啟 PDF 失敗，請稍後再試');
                    }
                  }}
                >
                  開新視窗查看同意書 PDF
                </KioskButton>
              </div>
              {disclaimerPdfError && (
                <p className="mt-2 text-sm font-semibold text-kiosk-danger">⚠️ {disclaimerPdfError}</p>
              )}
            </div>
          ) : (
            /* 外泌體使用者但未完成簽署（含服務人員已簽、顧客未簽的中間狀態） */
            <>
              <div className="rounded-kiosk border-2 border-amber-400 bg-amber-50 p-4">
                <p className="text-kiosk-base font-bold text-amber-800">⚠️ 外泌體同意書尚未完成</p>
                <p className="mt-1 text-sm text-amber-700">
                  {detail.disclaimerStaffSignedAt
                    ? '服務人員已簽名，請引導顧客完成下方簽署。'
                    : '需完成服務人員與顧客雙方簽名。'}
                </p>
                {!detail.disclaimerStaffSignedAt && (
                  <div className="mt-2">
                    <KioskButton variant="secondary" onClick={() => setExosomeModalOpen(true)}>
                      開始雙方簽署流程
                    </KioskButton>
                  </div>
                )}
              </div>
              {/* 顧客待簽（服務人員已簽）：使用現有的 DisclaimerSignSection */}
              {detail.disclaimerStaffSignedAt && (
                <DisclaimerSignSection
                  customerId={customerId}
                  disclaimerCustomerSignedAt={detail.disclaimerCustomerSignedAt}
                  disclaimerStaffSignedAt={detail.disclaimerStaffSignedAt}
                  disclaimerFullySigned={detail.disclaimerFullySigned}
                  onChanged={() => void loadDetail()}
                />
              )}
            </>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
            <MaskedPhoneInput name="phone" control={control} label="電話" errorMessage={errors.phone?.message} />
            <KioskInput
              label="住址"
              placeholder="請輸入住址（選填）"
              errorMessage={errors.address?.message}
              isValid={Boolean(dirtyFields.address) && !errors.address}
              {...register('address')}
            />
            <KioskInput
              label="LINE ID"
              placeholder="請輸入 LINE ID（選填）"
              errorMessage={errors.line?.message}
              isValid={Boolean(dirtyFields.line) && !errors.line}
              {...register('line')}
            />
            <KioskInput
              label="Email"
              placeholder="請輸入 Email（選填）"
              errorMessage={errors.email?.message}
              isValid={Boolean(dirtyFields.email) && !errors.email}
              {...register('email')}
            />
            <KioskInput
              label="備註"
              placeholder="請輸入備註（選填）"
              errorMessage={errors.note?.message}
              isValid={Boolean(dirtyFields.note) && !errors.note}
              {...register('note')}
            />

            {saveError && (
              <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
                ⚠️ {saveError}
              </p>
            )}
            {saved && !saveError && <p className="text-kiosk-base font-semibold text-kiosk-success">已儲存最新資料</p>}

            <div className="mt-auto">
              <KioskButton type="submit" variant="primary" fullWidth disabled={isSubmitting}>
                {isSubmitting ? '儲存中…' : '儲存修改'}
              </KioskButton>
            </div>
          </form>
        </>
      )}

      {tab === 'treatments' && detail && (
        <TreatmentRecordTab key={treatmentKey} customerId={customerId} storeId={detail.storeId} />
      )}

      {tab === 'courses' && (() => {
        // 按 serviceItemId 合併同品項課程（A+B 套裝含相同品項時顯示合計）
        const mergedGroups = courses
          ? Object.values(
              courses.reduce(
                (acc, c) => {
                  const key = c.serviceItem.id;
                  if (!acc[key]) acc[key] = { serviceItem: c.serviceItem, totalSessions: 0, usedSessions: 0, remainingSessions: 0, items: [] };
                  acc[key].totalSessions += c.totalSessions;
                  acc[key].usedSessions += c.usedSessions;
                  acc[key].remainingSessions += c.remainingSessions;
                  acc[key].items.push(c);
                  return acc;
                },
                {} as Record<number, { serviceItem: CustomerCourseItem['serviceItem']; totalSessions: number; usedSessions: number; remainingSessions: number; items: CustomerCourseItem[] }>,
              ),
            )
          : undefined;

        return (
          <div className="flex flex-col gap-4">
            <h3 className="text-kiosk-base font-bold text-slate-800">
              已購課程
              {mergedGroups && <span className="ml-2 text-sm font-normal text-slate-400">共 {mergedGroups.length} 種</span>}
            </h3>

            {coursesLoading && <p className="text-sm text-slate-400">載入中…</p>}
            {mergedGroups?.length === 0 && (
              <p className="rounded-kiosk bg-slate-50 p-4 text-center text-sm text-slate-400">尚無購課紀錄</p>
            )}
            {mergedGroups?.map((group) => (
              <div key={group.serviceItem.id} className="rounded-kiosk border border-slate-200 bg-white p-4 flex flex-col gap-3">
                {/* 合計欄 */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{group.serviceItem.name}</p>
                  <div className="text-right text-sm text-slate-500 shrink-0">
                    <p>總堂數：{group.totalSessions}</p>
                    <p>已用：{group.usedSessions}</p>
                    <p className={group.remainingSessions === 0 ? 'text-slate-400' : 'font-semibold text-slate-800'}>
                      剩餘：{group.remainingSessions} 堂
                    </p>
                  </div>
                </div>

                {/* 若來自多張課程，顯示各課程明細（供管理操作） */}
                {group.items.length > 1 && (
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-2">
                    {group.items.map((c) => (
                      <div key={c.id} className="flex flex-col gap-2 rounded bg-slate-50 p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">
                            購入 {c.totalSessions} 堂
                            {c.purchasePrice != null && `（$${c.purchasePrice.toLocaleString()}）`}
                          </span>
                          <span className={c.remainingSessions === 0 ? 'text-slate-400' : 'font-semibold text-slate-700'}>
                            剩 {c.remainingSessions} 堂
                          </span>
                        </div>
                        {canManageCourses(user?.role) && c.remainingSessions > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            <KioskButton variant="secondary" onClick={() => setRefundCourse(c)}>退課轉儲值</KioskButton>
                            <KioskButton variant="secondary" onClick={() => setConvertCourse(c)}>課程轉換</KioskButton>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 只有一張課程時直接在合計欄顯示管理按鈕 */}
                {group.items.length === 1 && canManageCourses(user?.role) && group.remainingSessions > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    <KioskButton variant="secondary" onClick={() => setRefundCourse(group.items[0])}>
                      退課轉儲值
                    </KioskButton>
                    <KioskButton variant="secondary" onClick={() => setConvertCourse(group.items[0])}>
                      課程轉換
                    </KioskButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <NewTreatmentModal
        open={treatmentModalOpen}
        customerId={customerId}
        onClose={() => setTreatmentModalOpen(false)}
        onCreated={() => {
          setTreatmentModalOpen(false);
          setTreatmentKey((k) => k + 1);
        }}
      />

      <ExosomeConsentModal
        open={exosomeModalOpen}
        customerId={customerId}
        customerName={detail?.name ?? ''}
        nationalId={detail?.nationalId ?? null}
        onCompleted={() => {
          setExosomeModalOpen(false);
          void loadDetail();
        }}
        onClose={() => setExosomeModalOpen(false)}
      />

      {detail && (
        <POSCheckoutModal
          open={posModalOpen}
          storeId={detail.storeId}
          customerId={customerId}
          customerName={detail.name}
          isExosomeUser={detail.isExosomeUser}
          disclaimerFullySigned={detail.disclaimerFullySigned}
          exosomeConsentSignatureUrl={detail.exosomeConsentSignatureUrl}
          onClose={() => setPosModalOpen(false)}
          onCompleted={() => {
            setPosModalOpen(false);
            setTab('treatments');
            setTreatmentKey((k) => k + 1);
          }}
        />
      )}

      {refundCourse && (
        <CourseRefundModal
          open={!!refundCourse}
          course={refundCourse}
          onCompleted={(newStoreCredit) => {
            setRefundCourse(undefined);
            setDetail((prev) => prev ? { ...prev, storeCredit: newStoreCredit } : prev);
            void loadCourses();
          }}
          onClose={() => setRefundCourse(undefined)}
        />
      )}

      {convertCourse && detail && (
        <CourseConvertModal
          open={!!convertCourse}
          course={convertCourse}
          storeId={detail.storeId}
          onCompleted={() => {
            setConvertCourse(undefined);
            void loadCourses();
          }}
          onClose={() => setConvertCourse(undefined)}
        />
      )}
    </div>
  );
}
