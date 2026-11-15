'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { changeOwnPassword } from '@/lib/auth-api';
import { updateSelf } from '@/lib/users-api';
import { getAuthUser, getAuthToken } from '@/lib/auth';
import { saveAccount, getSavedAccounts, removeSavedAccount } from '@/lib/multi-account';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

type Tab = 'profile' | 'account' | 'password' | 'pin';

function StatusMessage({ error, done, doneMsg }: { error?: string; done: boolean; doneMsg: string }) {
  if (error) return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-kiosk-danger" role="alert">⚠️ {error}</p>;
  if (done) return <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-kiosk-success">✓ {doneMsg}</p>;
  return null;
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getAuthUser>>();
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    setCurrentUser(getAuthUser());
  }, []);

  // ── 個人資料（姓名 + 電話） ──
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string>();
  const [profileDone, setProfileDone] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name ?? '');
      setPhone(currentUser.phone ?? '');
    }
  }, [currentUser]);

  async function onProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileSubmitting(true);
    setProfileError(undefined);
    setProfileDone(false);
    try {
      await updateSelf({ name: name.trim(), phone: phone.trim() });
      setProfileDone(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : '儲存失敗，請稍後再試');
    } finally {
      setProfileSubmitting(false);
    }
  }

  // ── 帳號 + Email ──
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountError, setAccountError] = useState<string>();
  const [accountDone, setAccountDone] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setUsername(currentUser.username ?? '');
      setEmail(currentUser.email ?? '');
    }
  }, [currentUser]);

  async function onAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAccountSubmitting(true);
    setAccountError(undefined);
    setAccountDone(false);
    try {
      await updateSelf({ username: username.trim(), email: email.trim() });
      setAccountDone(true);
    } catch (err) {
      setAccountError(err instanceof ApiError ? err.message : '儲存失敗，請稍後再試');
    } finally {
      setAccountSubmitting(false);
    }
  }

  // ── 密碼修改 ──
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string>();
  const [pwDone, setPwDone] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) { setPwError('新密碼至少 8 個字元'); return; }
    if (newPw !== confirmPw) { setPwError('兩次輸入的新密碼不一致'); return; }
    setPwSubmitting(true);
    setPwError(undefined);
    setPwDone(false);
    try {
      await changeOwnPassword(oldPw, newPw);
      setPwDone(true);
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : '修改密碼失敗，請稍後再試');
    } finally {
      setPwSubmitting(false);
    }
  }

  // ── 快速切換 PIN ──
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string>();
  const [pinDone, setPinDone] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (currentUser) {
      const saved = getSavedAccounts();
      setIsSaved(saved.some((a) => a.user.id === currentUser.id));
    }
  }, [currentUser]);

  function onPinSave(e: React.FormEvent) {
    e.preventDefault();
    setPinError(undefined);
    setPinDone(false);
    if (!/^\d{4}$/.test(pin)) { setPinError('PIN 必須為 4 位數字'); return; }
    if (pin !== pinConfirm) { setPinError('兩次輸入的 PIN 不一致'); return; }
    const user = getAuthUser();
    const token = getAuthToken();
    if (!user || !token) { setPinError('請重新登入後再試'); return; }
    saveAccount(token, user, pin);
    setIsSaved(true);
    setPinDone(true);
    setPin('');
    setPinConfirm('');
  }

  function onRemoveSaved() {
    if (currentUser) {
      removeSavedAccount(currentUser.id);
      setIsSaved(false);
    }
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'profile',  label: '個人資料', icon: '👤' },
    { id: 'account',  label: '帳號設定', icon: '🔑' },
    { id: 'password', label: '修改密碼', icon: '🔒' },
    { id: 'pin',      label: '切換 PIN',  icon: '🔢' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-kiosk-xl font-bold text-slate-900">個人設定</h1>

      <div className="max-w-lg rounded-2xl bg-white shadow-sm">
        {/* Tab 列 */}
        <div className="flex border-b border-slate-100">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-1 px-2 py-4 text-sm font-semibold transition-colors
                ${tab === t.id
                  ? 'border-b-2 border-kiosk-primary text-kiosk-primary'
                  : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* 個人資料 */}
          {tab === 'profile' && (
            <form onSubmit={onProfileSubmit} className="flex flex-col gap-5">
              <KioskInput
                label="姓名"
                type="text"
                required
                placeholder="請輸入姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <KioskInput
                label="聯絡電話"
                type="tel"
                placeholder="例：0912-345-678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <StatusMessage error={profileError} done={profileDone} doneMsg="個人資料已更新" />
              <KioskButton type="submit" variant="primary" fullWidth disabled={profileSubmitting}>
                {profileSubmitting ? '儲存中…' : '儲存資料'}
              </KioskButton>
            </form>
          )}

          {/* 帳號設定 */}
          {tab === 'account' && (
            <form onSubmit={onAccountSubmit} className="flex flex-col gap-5">
              <KioskInput
                label="登入帳號 (username)"
                type="text"
                required
                placeholder="英數字、底線、@ 或小數點"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <KioskInput
                label="Email"
                type="email"
                placeholder="請輸入 Email 地址"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <StatusMessage error={accountError} done={accountDone} doneMsg="帳號設定已更新" />
              <KioskButton type="submit" variant="primary" fullWidth disabled={accountSubmitting}>
                {accountSubmitting ? '儲存中…' : '儲存設定'}
              </KioskButton>
            </form>
          )}

          {/* 修改密碼 */}
          {tab === 'password' && (
            <form onSubmit={onPasswordSubmit} className="flex flex-col gap-5">
              <KioskInput
                label="原密碼"
                type="password"
                required
                placeholder="請輸入目前的密碼"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
              />
              <KioskInput
                label="新密碼"
                type="password"
                required
                placeholder="至少 8 個字元"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <KioskInput
                label="再次輸入新密碼"
                type="password"
                required
                placeholder="請再輸入一次新密碼"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
              <StatusMessage error={pwError} done={pwDone} doneMsg="密碼已修改完成" />
              <KioskButton type="submit" variant="primary" fullWidth disabled={pwSubmitting}>
                {pwSubmitting ? '送出中…' : '修改密碼'}
              </KioskButton>
            </form>
          )}
          {/* 快速切換 PIN */}
          {tab === 'pin' && (
            <div className="flex flex-col gap-5">
              <p className="text-sm text-slate-500">
                設定 4 位數 PIN 後，其他人可在帳號切換選單中選擇您的帳號並輸入 PIN 快速切換，無需重新登入。
              </p>
              {isSaved && (
                <div className="flex items-center justify-between rounded-kiosk border border-green-200 bg-green-50 px-4 py-3">
                  <span className="text-sm font-semibold text-green-700">✓ 已儲存於裝置快速切換</span>
                  <button
                    type="button"
                    onClick={onRemoveSaved}
                    className="text-sm text-red-500 hover:underline"
                  >
                    移除
                  </button>
                </div>
              )}
              <form onSubmit={onPinSave} className="flex flex-col gap-5">
                <KioskInput
                  label="設定 PIN（4 位數字）"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="例：1234"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinError(undefined); setPinDone(false); }}
                />
                <KioskInput
                  label="再次輸入 PIN"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="請再輸入一次"
                  value={pinConfirm}
                  onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '')); setPinError(undefined); setPinDone(false); }}
                />
                <StatusMessage error={pinError} done={pinDone} doneMsg="PIN 已設定，可在帳號切換選單中使用" />
                <KioskButton type="submit" variant="primary" fullWidth>
                  儲存 PIN
                </KioskButton>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
