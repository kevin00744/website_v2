'use client';

import { useEffect, useState } from 'react';
import { ROLE_LABEL } from '@website-v2/shared-types';
import { getAuthUser, type AuthUser } from '@/lib/auth';

/**
 * 後台歡迎頁：登入成功、或已登入卻打 /login，middleware 都會導到這裡（見 middleware.ts），
 * 不再像之前直接導去 /customers——這裡只是一個簡單的歡迎畫面，左側選單要點哪個功能再自己點進去。
 */
export default function AdminWelcomePage() {
  const [user, setUser] = useState<AuthUser>();

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="text-kiosk-xl font-bold text-slate-900">歡迎回來{user ? `，${user.name}` : ''}</h1>
      {user && <p className="text-kiosk-base text-slate-500">目前身分：{ROLE_LABEL[user.role]}</p>}
      <p className="text-kiosk-base text-slate-500">請從左側選單選擇要使用的功能</p>
    </div>
  );
}
