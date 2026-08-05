'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { changeOwnPassword } from '@/lib/auth-api';
import { updateSelf } from '@/lib/users-api';
import { getAuthUser } from '@/lib/auth';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

function useField(initial = '') {
  const [value, setValue] = useState(initial);
  return { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value) };
}

function StatusMessage({ error, done, doneMsg }: { error?: string; done: boolean; doneMsg: string }) {
  if (error) return <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">⚠️ {error}</p>;
  if (done) return <p className="text-kiosk-base font-semibold text-kiosk-success">{doneMsg}</p>;
  return null;
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getAuthUser>>();

  useEffect(() => {
    setCurrentUser(getAuthUser());
  }, []);

  // ── 姓名修改 ──
  const name = useField(currentUser?.name ?? '');
  useEffect(() => { if (currentUser) name.onChange({ target: { value: currentUser.name ?? '' } } as React.ChangeEvent<HTMLInputElement>); }, [currentUser]);
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [nameDone, setNameDone] = useState(false);

  async function onNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.value.trim()) return;
    setNameSubmitting(true);
    setNameError(undefined);
    setNameDone(false);
    try {
      await updateSelf({ name: name.value.trim() });
      setNameDone(true);
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : '修改姓名失敗，請稍後再試');
    } finally {
      setNameSubmitting(false);
    }
  }

  // ── Email 修改 ──
  const email = useField(currentUser?.email ?? '');
  useEffect(() => { if (currentUser) email.onChange({ target: { value: currentUser.email ?? '' } } as React.ChangeEvent<HTMLInputElement>); }, [currentUser]);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [emailDone, setEmailDone] = useState(false);

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailSubmitting(true);
    setEmailError(undefined);
    setEmailDone(false);
    try {
      await updateSelf({ email: email.value.trim() });
      setEmailDone(true);
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.message : '修改 Email 失敗，請稍後再試');
    } finally {
      setEmailSubmitting(false);
    }
  }

  // ── 帳號修改 ──
  const username = useField(currentUser?.username ?? '');
  useEffect(() => { if (currentUser) username.onChange({ target: { value: currentUser.username } } as React.ChangeEvent<HTMLInputElement>); }, [currentUser]);
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);
  const [usernameError, setUsernameError] = useState<string>();
  const [usernameDone, setUsernameDone] = useState(false);

  async function onUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.value.trim()) return;
    setUsernameSubmitting(true);
    setUsernameError(undefined);
    setUsernameDone(false);
    try {
      await updateSelf({ username: username.value.trim() });
      setUsernameDone(true);
    } catch (err) {
      setUsernameError(err instanceof ApiError ? err.message : '修改帳號失敗，請稍後再試');
    } finally {
      setUsernameSubmitting(false);
    }
  }

  // ── 電話修改 ──
  const phone = useField(currentUser?.phone ?? '');
  useEffect(() => { if (currentUser) phone.onChange({ target: { value: currentUser?.phone ?? '' } } as React.ChangeEvent<HTMLInputElement>); }, [currentUser]);
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState<string>();
  const [phoneDone, setPhoneDone] = useState(false);

  async function onPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhoneSubmitting(true);
    setPhoneError(undefined);
    setPhoneDone(false);
    try {
      await updateSelf({ phone: phone.value.trim() });
      setPhoneDone(true);
    } catch (err) {
      setPhoneError(err instanceof ApiError ? err.message : '修改電話失敗，請稍後再試');
    } finally {
      setPhoneSubmitting(false);
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-kiosk-xl font-bold text-slate-900">個人設定</h1>

      {/* 姓名修改 */}
      <form
        onSubmit={onNameSubmit}
        className="flex max-w-md flex-col gap-5 rounded-kiosk border-2 border-slate-200 bg-white p-6"
      >
        <h2 className="text-kiosk-lg font-bold text-slate-900">修改姓名</h2>
        <KioskInput
          label="姓名"
          type="text"
          required
          placeholder="請輸入姓名"
          {...name}
        />
        <StatusMessage error={nameError} done={nameDone} doneMsg="姓名已修改完成" />
        <KioskButton type="submit" variant="primary" fullWidth disabled={nameSubmitting}>
          {nameSubmitting ? '送出中…' : '修改姓名'}
        </KioskButton>
      </form>

      {/* Email 修改 */}
      <form
        onSubmit={onEmailSubmit}
        className="flex max-w-md flex-col gap-5 rounded-kiosk border-2 border-slate-200 bg-white p-6"
      >
        <h2 className="text-kiosk-lg font-bold text-slate-900">修改 Email</h2>
        <KioskInput
          label="Email"
          type="email"
          placeholder="請輸入 Email 地址"
          {...email}
        />
        <StatusMessage error={emailError} done={emailDone} doneMsg="Email 已修改完成" />
        <KioskButton type="submit" variant="primary" fullWidth disabled={emailSubmitting}>
          {emailSubmitting ? '送出中…' : '修改 Email'}
        </KioskButton>
      </form>

      {/* 帳號修改 */}
      <form
        onSubmit={onUsernameSubmit}
        className="flex max-w-md flex-col gap-5 rounded-kiosk border-2 border-slate-200 bg-white p-6"
      >
        <h2 className="text-kiosk-lg font-bold text-slate-900">修改登入帳號</h2>
        <KioskInput
          label="新帳號 (username)"
          type="text"
          required
          placeholder="英數字、底線、@ 或小數點"
          {...username}
        />
        <StatusMessage error={usernameError} done={usernameDone} doneMsg="帳號已修改完成" />
        <KioskButton type="submit" variant="primary" fullWidth disabled={usernameSubmitting}>
          {usernameSubmitting ? '送出中…' : '修改帳號'}
        </KioskButton>
      </form>

      {/* 電話修改 */}
      <form
        onSubmit={onPhoneSubmit}
        className="flex max-w-md flex-col gap-5 rounded-kiosk border-2 border-slate-200 bg-white p-6"
      >
        <h2 className="text-kiosk-lg font-bold text-slate-900">修改聯絡電話</h2>
        <KioskInput
          label="電話"
          type="tel"
          placeholder="例：0912-345-678"
          {...phone}
        />
        <StatusMessage error={phoneError} done={phoneDone} doneMsg="電話已修改完成" />
        <KioskButton type="submit" variant="primary" fullWidth disabled={phoneSubmitting}>
          {phoneSubmitting ? '送出中…' : '修改電話'}
        </KioskButton>
      </form>

      {/* 密碼修改 */}
      <form
        onSubmit={onPasswordSubmit}
        className="flex max-w-md flex-col gap-5 rounded-kiosk border-2 border-slate-200 bg-white p-6"
      >
        <h2 className="text-kiosk-lg font-bold text-slate-900">修改密碼</h2>
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
    </div>
  );
}
