'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { login } from '@/lib/auth-api';
import { saveSession } from '@/lib/auth';
import { updateSavedAccountToken } from '@/lib/multi-account';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { InstallHint } from '@/components/admin/InstallHint';
import { TextSizeButton } from '@/components/admin/TextSizeControl';
import { isStandalone } from '@/lib/pwa';

export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [rememberDevice, setRememberDevice] = useState(false);

  // 主畫面 App 和 Safari 的登入狀態是分開的：從主畫面開啟時預設記住裝置，避免每天重新登入
  useEffect(() => {
    if (isStandalone()) setRememberDevice(true);
  }, []);

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
      // 勾「記住這台裝置」：後端多給 refresh token，裝置不會因 token 到期或系統更新而被登出
      const result = await login(values.username, values.password, rememberDevice);
      saveSession(result);
      // 這個帳號若已設定 PIN 快速切換，順便更新它保存的 token
      updateSavedAccountToken(result.user.id, result.accessToken, result.user, result.refreshToken);
      window.location.href = '/admin';
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '登入失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pt-safe pb-safe relative flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
      {/* 右上角文字大小（跟安裝提示分開放，避免在手機上互相蓋住） */}
      <div className="mb-3 flex w-full max-w-md justify-end">
        <TextSizeButton className="rounded-kiosk bg-white shadow-sm" />
      </div>
      <InstallHint className="mb-6 w-full max-w-md" />
      {/* 品牌區 */}
      <div className="mb-8 text-center">
        <div className="mb-2 text-5xl">✨</div>
        <h1 className="text-kiosk-xl font-bold text-kiosk-primary">璨妍管理後台</h1>
        <p className="mt-1 text-slate-500">請登入您的帳號以繼續</p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <div className="flex flex-col gap-5">
          <KioskInput
            label="帳號"
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

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-5 w-5 accent-kiosk-primary"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
            />
            記住此裝置（免重新登入）
          </label>

          {submitError && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-kiosk-danger" role="alert">
              ⚠️ {submitError}
            </p>
          )}

          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting} className="mt-1">
            {submitting ? '登入中…' : '登入'}
          </KioskButton>
        </div>
      </form>
    </div>
  );
}
