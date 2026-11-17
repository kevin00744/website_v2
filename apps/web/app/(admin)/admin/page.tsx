'use client';

import { useEffect, useState } from 'react';
import { ROLE_LABEL } from '@website-v2/shared-types';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { NAVIGATION_CONFIG } from '@/lib/navigationConfig';

export default function AdminWelcomePage() {
  const [user, setUser] = useState<AuthUser>();

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const shortcuts = user
    ? NAVIGATION_CONFIG.filter((item) => !item.roleGuard || item.roleGuard(user.role)).slice(0, 6)
    : [];

  // 問候語依「瀏覽器」的當地時間計算：伺服器是 UTC，若在 SSR 階段算會和台灣時間對不上（hydration 錯誤）
  const [greeting, setGreeting] = useState('您好');
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安');
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {/* 歡迎區 */}
      <div className="rounded-2xl bg-gradient-to-br from-kiosk-primary to-kiosk-primary-dark px-6 py-8 text-white shadow-sm">
        <p className="text-lg opacity-80">{greeting}！</p>
        <h1 className="mt-1 text-kiosk-xl font-bold">
          {user ? user.name : '...'} 您好
        </h1>
        {user && (
          <p className="mt-1 opacity-70">
            {(ROLE_LABEL as Record<string, string>)[user.role] ?? user.role}
          </p>
        )}
      </div>

      {/* 快速入口 */}
      {shortcuts.length > 0 && (
        <div>
          <h2 className="mb-3 text-kiosk-base font-semibold text-slate-500">快速入口</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shortcuts.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-6 shadow-sm transition hover:bg-kiosk-primary/5 hover:shadow-md active:scale-95"
              >
                <span className="text-4xl leading-none">{item.icon}</span>
                <span className="text-center text-kiosk-base font-semibold text-slate-700">{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
