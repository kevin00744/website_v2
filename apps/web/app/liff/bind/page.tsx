'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, liffFetch } from '@/lib/liff';
import { Field, LIFF_INPUT_CLASS, LiffButton, LiffCard, useLiffMe } from '../LiffGate';

/**
 * 會員綁定：
 * - 來過門市：輸入當時留下的手機與姓名 → 對應既有會員資料
 * - 第一次：同一張表單，系統查無資料時自動建立基本資料
 */
export default function LiffBindPage() {
  const router = useRouter();
  const { me, refreshMe } = useLiffMe();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ created: boolean }>();

  if (me.bound && !done) {
    return (
      <LiffCard title="會員綁定">
        <p>您已綁定會員：<strong>{me.customer?.name}</strong></p>
        <p className="mt-1 text-sm text-slate-500">手機 {me.customer?.phoneMasked}</p>
        <LiffButton className="mt-5" onClick={() => router.push('/liff/me')}>查看我的資料</LiffButton>
      </LiffCard>
    );
  }

  if (done) {
    return (
      <LiffCard title="綁定完成 🎉">
        <p>{done.created ? '已為您建立會員資料，歡迎第一次光臨！' : '已成功連結您的會員資料。'}</p>
        <div className="mt-5 flex flex-col gap-3">
          <LiffButton onClick={() => router.push('/liff/booking')}>立即預約</LiffButton>
          <LiffButton variant="ghost" onClick={() => router.push('/liff/me')}>查看堂數與儲值金</LiffButton>
        </div>
      </LiffCard>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await liffFetch<{ bound: boolean; created: boolean }>('/bind', {
        method: 'POST',
        json: { phone, name, email: email || undefined },
      });
      await refreshMe();
      setDone({ created: res.created });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">會員綁定</h1>
      <LiffCard>
        <p className="text-sm text-slate-600">
          來過門市的貴賓，請輸入<strong>當時留下的手機號碼與姓名</strong>，系統會自動帶出您的會員資料。
          第一次光臨的貴賓，填寫後會直接建立會員資料。
        </p>
      </LiffCard>
      <LiffCard>
        <div className="flex flex-col gap-4">
          <Field label="手機號碼" required>
            <input
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912345678"
              required
              className={LIFF_INPUT_CLASS}
            />
          </Field>
          <Field label="姓名" required>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className={LIFF_INPUT_CLASS} />
          </Field>
          <Field label="Email（選填）">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={LIFF_INPUT_CLASS} />
          </Field>
        </div>
      </LiffCard>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <LiffButton type="submit" disabled={busy}>{busy ? '處理中…' : '確認綁定'}</LiffButton>
      <p className="text-center text-xs text-slate-400">您的資料僅用於會員服務與預約通知</p>
    </form>
  );
}
