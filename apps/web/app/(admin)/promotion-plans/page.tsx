'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import {
  listPromotionPlans,
  createPromotionPlan,
  updatePromotionPlan,
  deletePromotionPlan,
  type PromotionPlan,
  type PromotionPlanType,
} from '@/lib/promotion-plans-api';
import { listStoreServiceItems, type StoreServiceItem } from '@/lib/store-service-items-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';

const TYPE_LABELS: Record<PromotionPlanType, string> = {
  top_up_bonus: '儲值優惠（儲 X 送 Y）',
  course_bundle: '課程套組（多品項組合包）',
};

const PAYMENT_METHOD_LABELS = {
  cash: '現金',
  transfer: '轉帳',
  line_pay: 'LINE Pay',
  credit_card: '信用卡',
};

interface CourseItem {
  serviceItemId: string;
  sessions: string;
}

export default function PromotionPlansPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [plans, setPlans] = useState<PromotionPlan[]>();
  const [serviceItems, setServiceItems] = useState<StoreServiceItem[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formType, setFormType] = useState<PromotionPlanType>('top_up_bonus');
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formBonus, setFormBonus] = useState('');
  // Dynamic field array for course_bundle
  const [courseItems, setCourseItems] = useState<CourseItem[]>([{ serviceItemId: '', sessions: '1' }]);
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // 編輯狀態
  const [editingPlan, setEditingPlan] = useState<PromotionPlan | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editBonus, setEditBonus] = useState('');
  const [editCourseItems, setEditCourseItems] = useState<CourseItem[]>([]);
  const [editError, setEditError] = useState<string>();
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    const user = getAuthUser();
    if (!user?.storeId) return;
    setStoreId(user.storeId);
    void loadPlans(user.storeId);
    // 促銷方案只能選「分店自己建立的品項」，不含全域通用項目
    void listStoreServiceItems(user.storeId).then(setServiceItems).catch(() => {/* 靜默 */});
  }, []);

  async function loadPlans(sid: number) {
    setLoadError(undefined);
    try {
      setPlans(await listPromotionPlans(sid));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入失敗，請稍後再試');
    }
  }

  function resetForm() {
    setFormName('');
    setFormPrice('');
    setFormBonus('');
    setFormType('top_up_bonus');
    setCourseItems([{ serviceItemId: '', sessions: '1' }]);
    setFormError(undefined);
    setShowForm(false);
  }

  // ── Dynamic field array helpers ──────────────────────────────────────────
  function addCourseItem() {
    setCourseItems((prev) => [...prev, { serviceItemId: '', sessions: '1' }]);
  }

  function removeCourseItem(index: number) {
    setCourseItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCourseItem(index: number, field: keyof CourseItem, value: string) {
    setCourseItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  async function handleCreate() {
    if (!storeId) return;
    setFormError(undefined);

    const price = Number(formPrice);
    if (!formName.trim()) { setFormError('請輸入方案名稱'); return; }
    if (!price || price <= 0) { setFormError('請輸入正確的售價'); return; }

    if (formType === 'top_up_bonus') {
      const bonus = Number(formBonus);
      if (!bonus || bonus <= 0) { setFormError('請輸入儲值優惠的贈送金額'); return; }
    }

    if (formType === 'course_bundle') {
      if (courseItems.length === 0) { setFormError('課程套組至少需要一個課程品項'); return; }
      for (const item of courseItems) {
        if (!item.serviceItemId) { setFormError('請為每個課程品項選擇服務項目'); return; }
        const sessions = Number(item.sessions);
        if (!sessions || sessions <= 0) { setFormError('每個課程品項的堂數必須為正整數'); return; }
      }
    }

    setSubmitting(true);
    try {
      await createPromotionPlan(storeId, {
        name: formName.trim(),
        type: formType,
        price,
        ...(formType === 'top_up_bonus' ? { bonusAmount: Number(formBonus) } : {}),
        ...(formType === 'course_bundle'
          ? { items: courseItems.map((i) => ({ serviceItemId: Number(i.serviceItemId), sessions: Number(i.sessions) })) }
          : {}),
      });
      resetForm();
      void loadPlans(storeId);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '新增失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(plan: PromotionPlan) {
    setEditingPlan(plan);
    setEditName(plan.name);
    setEditPrice(String(plan.price));
    setEditBonus(plan.bonusAmount != null ? String(plan.bonusAmount) : '');
    setEditCourseItems(plan.items.map((i) => ({ serviceItemId: String(i.serviceItem.id), sessions: String(i.sessions) })));
    setEditError(undefined);
  }

  async function handleUpdate() {
    if (!storeId || !editingPlan) return;
    setEditError(undefined);
    if (!editName.trim()) { setEditError('請輸入方案名稱'); return; }
    const price = Number(editPrice);
    if (!price || price <= 0) { setEditError('請輸入正確的售價'); return; }
    if (editingPlan.type === 'top_up_bonus') {
      if (!Number(editBonus) || Number(editBonus) <= 0) { setEditError('請輸入贈送金額'); return; }
    }
    if (editingPlan.type === 'course_bundle') {
      for (const item of editCourseItems) {
        if (!item.serviceItemId) { setEditError('請為每個品項選擇課程'); return; }
        if (!Number(item.sessions) || Number(item.sessions) <= 0) { setEditError('堂數必須為正整數'); return; }
      }
    }
    setEditSubmitting(true);
    try {
      const updated = await updatePromotionPlan(storeId, editingPlan.id, {
        name: editName.trim(),
        price,
        ...(editingPlan.type === 'top_up_bonus' ? { bonusAmount: Number(editBonus) } : {}),
        ...(editingPlan.type === 'course_bundle'
          ? { items: editCourseItems.map((i) => ({ serviceItemId: Number(i.serviceItemId), sessions: Number(i.sessions) })) }
          : {}),
      });
      setPlans((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)));
      setEditingPlan(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : '更新失敗，請稍後再試');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(planId: number, planName: string) {
    if (!storeId) return;
    if (!window.confirm(`確定要刪除「${planName}」方案嗎？`)) return;
    try {
      await deletePromotionPlan(storeId, planId);
      void loadPlans(storeId);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '刪除失敗');
    }
  }

  const serviceItemOptions = serviceItems.map((i) => ({
    value: String(i.id),
    label: `${i.name}（$${i.price.toLocaleString()}/${i.isOutsourced ? '外包' : '自辦'}）`,
  }));

  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">您的帳號未指定所屬分店。</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">促銷方案管理</h1>
        {!showForm && (
          <KioskButton variant="primary" onClick={() => setShowForm(true)}>
            ＋ 新增方案
          </KioskButton>
        )}
      </div>

      {/* ── 新增表單 ── */}
      {showForm && (
        <div className="mb-6 rounded-kiosk border-2 border-kiosk-primary/30 bg-white p-6">
          <h2 className="mb-4 text-kiosk-lg font-bold text-slate-800">新增促銷方案</h2>
          <div className="flex flex-col gap-4">
            <KioskInput
              label="方案名稱"
              required
              placeholder="例：夏季煥顏 A+B 套組"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <KioskSelect
              label="方案類型"
              required
              options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              value={formType}
              onChange={(e) => {
                setFormType(e.target.value as PromotionPlanType);
                setFormBonus('');
                setCourseItems([{ serviceItemId: '', sessions: '1' }]);
              }}
            />
            <KioskInput
              label="售價（元）"
              required
              type="number"
              min={1}
              placeholder="例：10000"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
            />

            {/* 儲值優惠 */}
            {formType === 'top_up_bonus' && (
              <KioskInput
                label="贈送儲值金（元）"
                required
                type="number"
                min={1}
                placeholder="例：500"
                value={formBonus}
                onChange={(e) => setFormBonus(e.target.value)}
              />
            )}

            {/* 課程套組：Dynamic Field Array */}
            {formType === 'course_bundle' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-kiosk-base font-bold text-slate-800">包含課程品項 *</span>
                  <KioskButton variant="secondary" onClick={addCourseItem}>
                    ＋ 新增品項
                  </KioskButton>
                </div>
                {courseItems.map((item, index) => (
                  <div key={index} className="flex items-end gap-2 rounded-kiosk border border-slate-200 p-3">
                    <div className="flex-1">
                      <KioskSelect
                        label={`品項 ${index + 1}：課程`}
                        required
                        placeholder="請選擇課程…"
                        options={serviceItemOptions}
                        value={item.serviceItemId}
                        onChange={(e) => updateCourseItem(index, 'serviceItemId', e.target.value)}
                      />
                    </div>
                    <div className="w-28">
                      <KioskInput
                        label="堂數"
                        required
                        type="number"
                        min={1}
                        value={item.sessions}
                        onChange={(e) => updateCourseItem(index, 'sessions', e.target.value)}
                      />
                    </div>
                    {courseItems.length > 1 && (
                      <KioskButton
                        variant="danger"
                        onClick={() => removeCourseItem(index)}
                        className="mb-0.5 shrink-0"
                      >
                        ✕
                      </KioskButton>
                    )}
                  </div>
                ))}
                <p className="text-sm text-slate-400">
                  提示：可新增多個品項，例如 A 課程 10 堂 + B 課程 2 堂（贈品）。
                </p>
              </div>
            )}

            {formError && (
              <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {formError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <KioskButton variant="ghost" onClick={resetForm} disabled={submitting} fullWidth>
                取消
              </KioskButton>
              <KioskButton variant="primary" onClick={() => void handleCreate()} disabled={submitting} fullWidth>
                {submitting ? '新增中…' : '確認新增'}
              </KioskButton>
            </div>
          </div>
        </div>
      )}

      {/* ── 方案列表 ── */}
      {loadError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>}
      {!plans && !loadError && <p className="text-kiosk-base text-slate-400">載入中…</p>}
      {plans && plans.length === 0 && (
        <p className="rounded-kiosk bg-slate-50 p-6 text-center text-kiosk-base text-slate-500">
          尚無促銷方案，請點「＋ 新增方案」建立。
        </p>
      )}
      {plans?.map((plan) => (
        <div key={plan.id} className="mb-3 rounded-kiosk border border-slate-200 bg-white">
          {/* 方案卡片 */}
          <div className="flex items-start justify-between gap-2 p-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-kiosk-base font-bold text-slate-900">{plan.name}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {TYPE_LABELS[plan.type]}
                </span>
              </div>
              <p className="mt-1 text-kiosk-base font-semibold text-kiosk-primary">
                售價：${plan.price.toLocaleString()}
                {plan.type === 'top_up_bonus' && plan.bonusAmount != null && (
                  <span className="ml-2 font-normal text-slate-600">贈 ${plan.bonusAmount.toLocaleString()} 儲值金</span>
                )}
              </p>
              {plan.type === 'course_bundle' && plan.items.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {plan.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-kiosk-primary" />
                      {item.serviceItem.name} × {item.sessions} 堂
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <KioskButton variant="secondary" onClick={() => openEdit(plan)}>編輯</KioskButton>
              <KioskButton variant="danger" onClick={() => void handleDelete(plan.id, plan.name)}>刪除</KioskButton>
            </div>
          </div>

          {/* Inline 編輯表單 */}
          {editingPlan?.id === plan.id && (
            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-3">
                <KioskInput label="方案名稱" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                <KioskInput label="售價（元）" required type="number" min={1} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                {plan.type === 'top_up_bonus' && (
                  <KioskInput label="贈送儲值金（元）" required type="number" min={1} value={editBonus} onChange={(e) => setEditBonus(e.target.value)} />
                )}
                {plan.type === 'course_bundle' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-kiosk-base font-bold text-slate-800">課程品項</span>
                      <KioskButton variant="secondary" onClick={() => setEditCourseItems((p) => [...p, { serviceItemId: '', sessions: '1' }])}>
                        ＋ 新增
                      </KioskButton>
                    </div>
                    {editCourseItems.map((item, idx) => (
                      <div key={idx} className="flex items-end gap-2 rounded border border-slate-200 p-2">
                        <div className="flex-1">
                          <KioskSelect
                            label={`品項 ${idx + 1}`}
                            placeholder="選擇課程…"
                            options={serviceItemOptions}
                            value={item.serviceItemId}
                            onChange={(e) => setEditCourseItems((p) => p.map((x, i) => i === idx ? { ...x, serviceItemId: e.target.value } : x))}
                          />
                        </div>
                        <div className="w-24">
                          <KioskInput label="堂數" type="number" min={1} value={item.sessions}
                            onChange={(e) => setEditCourseItems((p) => p.map((x, i) => i === idx ? { ...x, sessions: e.target.value } : x))}
                          />
                        </div>
                        {editCourseItems.length > 1 && (
                          <KioskButton variant="danger" onClick={() => setEditCourseItems((p) => p.filter((_, i) => i !== idx))}>✕</KioskButton>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {editError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {editError}</p>}
                <div className="flex gap-2">
                  <KioskButton variant="ghost" onClick={() => setEditingPlan(null)} disabled={editSubmitting} fullWidth>取消</KioskButton>
                  <KioskButton variant="primary" onClick={() => void handleUpdate()} disabled={editSubmitting} fullWidth>
                    {editSubmitting ? '儲存中…' : '儲存'}
                  </KioskButton>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
