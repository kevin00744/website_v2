'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { login } from '@/lib/auth-api';
import { saveAuth } from '@/lib/auth';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: { username: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const result = await login(values.username, values.password);
      saveAuth(result.accessToken, result.user);
      // 故意用整頁導航（不是 router.push）：AdminShell 是 (admin) layout 裡常駐的 client component，
      // 它的 useEffect(() => setUser(getAuthUser()), []) 只在第一次掛載時讀一次 cookie——
      // 用 router.push 做 client-side 路由切換不會重新掛載 layout，導致登入後側邊選單（左側 bar）
      // 還停留在「未登入」的畫面，要手動重新整理才會正確顯示。整頁導航會讓 layout 重新掛載，
      // 一進 /admin 就能立刻讀到剛剛存好的 cookie，不需要使用者自己刷新。
      window.location.href = '/admin';
    } catch (error) {
      // 帳號不存在跟密碼錯誤都只會收到同一個白話文訊息（AUTH_INVALID_CREDENTIALS 轉譯），
      // 不會把伺服器的技術訊息/狀態碼顯示出來，也絕不用瀏覽器原生 alert()。
      setSubmitError(error instanceof ApiError ? error.message : '登入失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full max-w-md flex-col gap-6 rounded-kiosk border-2 border-slate-200 bg-white p-8 shadow-sm md:p-10"
      >
        <h1 className="text-center text-kiosk-xl font-bold text-slate-900">店員登入</h1>

        <KioskInput
          label="帳號 (username)"
          type="text"
          required
          autoComplete="username"
          placeholder="請輸入登入帳號"
          errorMessage={errors.username?.message}
          isValid={Boolean(dirtyFields.username) && !errors.username}
          {...register('username')}
        />
        <KioskInput
          label="密碼"
          type="password"
          required
          autoComplete="current-password"
          placeholder="請輸入密碼"
          errorMessage={errors.password?.message}
          isValid={Boolean(dirtyFields.password) && !errors.password}
          {...register('password')}
        />

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
          {submitting ? '登入中…' : '登入'}
        </KioskButton>
      </form>
    </div>
  );
}
