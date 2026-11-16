import type { Metadata } from 'next';
import { LiffGate } from './LiffGate';

export const metadata: Metadata = {
  title: '會員服務',
};

/** 顧客從 LINE 開啟的頁面（不走後台登入；middleware 的 matcher 不含 /liff） */
export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F3EF] text-slate-900">
      <div className="mx-auto max-w-md px-4 pb-10 pt-5">
        <LiffGate>{children}</LiffGate>
      </div>
    </div>
  );
}
