'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { errorMessage, initLiff, liffFetch, type LiffMe } from '@/lib/liff';

interface LiffContextValue {
  me: LiffMe;
  refreshMe: () => Promise<void>;
}

const LiffContext = createContext<LiffContextValue | null>(null);

export function useLiffMe(): LiffContextValue {
  const ctx = useContext(LiffContext);
  if (!ctx) throw new Error('useLiffMe must be used inside <LiffGate>');
  return ctx;
}

/** 初始化 LIFF 並取得綁定狀態，完成前顯示載入畫面 */
export function LiffGate({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<LiffMe>();
  const [error, setError] = useState<string>();

  const refreshMe = useCallback(async () => {
    setMe(await liffFetch<LiffMe>('/me'));
  }, []);

  useEffect(() => {
    initLiff()
      .then(refreshMe)
      .catch((err) => setError(errorMessage(err)));
  }, [refreshMe]);

  if (error) {
    return (
      <div className="mt-20 rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-bold">暫時無法開啟</p>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
      </div>
    );
  }
  if (!me) {
    return <p className="mt-24 text-center text-slate-400">載入中…</p>;
  }
  return <LiffContext.Provider value={{ me, refreshMe }}>{children}</LiffContext.Provider>;
}

export function LiffCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      {title && <h2 className="mb-3 text-base font-bold text-[#7F5539]">{title}</h2>}
      {children}
    </section>
  );
}

export const LIFF_INPUT_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base focus:border-transparent focus:outline focus:outline-2 focus:outline-[#B08968]';

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export function LiffButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const { variant = 'primary', className = '', ...rest } = props;
  const style =
    variant === 'primary'
      ? 'bg-[#B08968] text-white hover:bg-[#9C7656]'
      : 'border border-[#B08968] text-[#7F5539] hover:bg-[#B08968]/10';
  return (
    <button
      {...rest}
      className={`min-h-[3rem] w-full rounded-xl px-4 text-base font-bold transition-colors disabled:opacity-50 ${style} ${className}`}
    />
  );
}
