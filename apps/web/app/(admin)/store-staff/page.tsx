'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { getAuthUser } from '@/lib/auth';
import { listStoreStaff, createStoreStaff, updateStoreStaff, deleteStoreStaff, type StoreStaffMember } from '@/lib/stores-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

export default function StoreStaffPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [staff, setStaff] = useState<StoreStaffMember[]>();
  const [loadError, setLoadError] = useState<string>();
  const [showForm, setShowForm] = useState(false);
  // 編輯狀態
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState<string>();
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const user = getAuthUser();
    if (!user?.storeId) return;
    setStoreId(user.storeId);
    void loadStaff(user.storeId);
  }, []);

  async function loadStaff(sid: number) {
    setLoadError(undefined);
    try {
      setStaff(await listStoreStaff(sid));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '載入失敗，請稍後再試');
    }
  }

  function resetForm() {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormError(undefined);
    setShowForm(false);
  }

  function openEdit(s: StoreStaffMember) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditEmail(s.email);
    setEditError(undefined);
  }

  async function handleUpdate() {
    if (!storeId || !editingId) return;
    if (!editName.trim()) { setEditError('請輸入姓名'); return; }
    setEditSubmitting(true);
    setEditError(undefined);
    try {
      const updated = await updateStoreStaff(storeId, editingId, { name: editName.trim(), email: editEmail.trim() || undefined });
      setStaff((prev) => prev?.map((s) => (s.id === updated.id ? { ...s, name: updated.name, email: updated.email } : s)));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : '更新失敗');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(s: StoreStaffMember) {
    if (!storeId) return;
    if (!window.confirm(`確定要刪除員工「${s.name}」嗎？`)) return;
    try {
      await deleteStoreStaff(storeId, s.id);
      setStaff((prev) => prev?.filter((x) => x.id !== s.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '刪除失敗');
    }
  }

  async function handleCreate() {
    if (!storeId) return;
    setFormError(undefined);
    if (!formName.trim()) { setFormError('請輸入姓名'); return; }
    if (!formEmail.trim() || !formEmail.includes('@')) { setFormError('請輸入正確的 Email'); return; }
    if (formPassword.length < 8) { setFormError('密碼至少 8 個字元'); return; }

    setSubmitting(true);
    try {
      await createStoreStaff(storeId, {
        name: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        password: formPassword,
      });
      resetForm();
      void loadStaff(storeId);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : '新增失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  if (!storeId) {
    return <p className="py-16 text-center text-kiosk-base text-slate-500">您的帳號未指定所屬分店。</p>;
  }

  const ROLE_LABEL: Record<string, string> = {
    manager: '店長',
    staff: '服務人員',
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-kiosk-xl font-bold text-slate-900">分店員工管理</h1>
        {!showForm && (
          <KioskButton variant="primary" onClick={() => setShowForm(true)}>
            ＋ 新增員工
          </KioskButton>
        )}
      </div>

      {/* 新增員工表單 */}
      {showForm && (
        <div className="mb-6 rounded-kiosk border-2 border-kiosk-primary/30 bg-white p-6">
          <h2 className="mb-4 text-kiosk-lg font-bold text-slate-800">新增服務人員帳號</h2>
          <p className="mb-4 text-sm text-slate-500">
            此帳號類型固定為「服務人員」，可用於登入後台、打卡及服務紀錄。
          </p>
          <div className="flex flex-col gap-4">
            <KioskInput
              label="姓名"
              required
              placeholder="員工真實姓名"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <KioskInput
              label="Email（登入帳號）"
              required
              type="email"
              placeholder="staff@example.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
            <KioskInput
              label="初始密碼"
              required
              type="password"
              placeholder="至少 8 個字元"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
            />
            {formError && (
              <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {formError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <KioskButton variant="ghost" onClick={resetForm} disabled={submitting} fullWidth>
                取消
              </KioskButton>
              <KioskButton variant="primary" onClick={() => void handleCreate()} disabled={submitting} fullWidth>
                {submitting ? '建立中…' : '建立帳號'}
              </KioskButton>
            </div>
          </div>
        </div>
      )}

      {/* 員工列表 */}
      {loadError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {loadError}</p>}
      {!staff && !loadError && <p className="text-kiosk-base text-slate-400">載入中…</p>}
      {staff && staff.length === 0 && (
        <p className="rounded-kiosk bg-slate-50 p-6 text-center text-kiosk-base text-slate-500">
          目前分店尚無員工帳號，請點「＋ 新增員工」建立。
        </p>
      )}
      {staff && staff.map((s) => (
        <div key={s.id} className="mb-3 rounded-kiosk border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-kiosk-base font-semibold text-slate-900">{s.name}</p>
              <p className="text-sm text-slate-500">{s.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {s.isActive ? '啟用' : '停用'}
              </span>
              {s.role === 'staff' && (
                <>
                  <KioskButton variant="secondary" onClick={() => openEdit(s)}>編輯</KioskButton>
                  <KioskButton variant="danger" onClick={() => void handleDelete(s)}>刪除</KioskButton>
                </>
              )}
            </div>
          </div>
          {editingId === s.id && (
            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-3">
                <KioskInput label="姓名" required value={editName} onChange={(e) => setEditName(e.target.value)} />
                <KioskInput label="Email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                {editError && <p className="text-kiosk-base font-semibold text-kiosk-danger">⚠️ {editError}</p>}
                <div className="flex gap-2">
                  <KioskButton variant="ghost" onClick={() => setEditingId(null)} disabled={editSubmitting} fullWidth>取消</KioskButton>
                  <KioskButton variant="primary" onClick={() => void handleUpdate()} disabled={editSubmitting} fullWidth>
                    {editSubmitting ? '儲存中…' : '儲存'}
                  </KioskButton>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <p className="mt-4 text-sm text-slate-400">
        ※ 停用員工帳號請至「帳號管理」頁面操作。
      </p>
    </div>
  );
}
