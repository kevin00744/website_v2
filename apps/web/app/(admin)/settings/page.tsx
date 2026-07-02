'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { changePasswordSchema, type ChangePasswordInput } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { changeOwnPassword } from '@/lib/auth-api';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

/** 任何登入帳號都能進這頁改自己的密碼，跟帳號管理（只限 admin）是完全不同的頁面/權限範圍 */
export default function SettingsPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onChange',
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordInput) {
    setSubmitting(true);
    setSubmitError(undefined);
    setDone(false);
    try {
      await changeOwnPassword(values.oldPassword, values.newPassword);
      setDone(true);
      reset({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '修改密碼失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-kiosk-xl font-bold text-slate-900">個人設定</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex max-w-md flex-col gap-5 rounded-kiosk border-2 border-slate-200 bg-white p-6"
      >
        <h2 className="text-kiosk-lg font-bold text-slate-900">修改密碼</h2>
        <KioskInput
          label="原密碼"
          type="password"
          required
          placeholder="請輸入目前的密碼"
          errorMessage={errors.oldPassword?.message}
          isValid={Boolean(dirtyFields.oldPassword) && !errors.oldPassword}
          {...register('oldPassword')}
        />
        <KioskInput
          label="新密碼"
          type="password"
          required
          placeholder="至少 8 個字元"
          errorMessage={errors.newPassword?.message}
          isValid={Boolean(dirtyFields.newPassword) && !errors.newPassword}
          {...register('newPassword')}
        />
        <KioskInput
          label="再次輸入新密碼"
          type="password"
          required
          placeholder="請再輸入一次新密碼"
          errorMessage={errors.confirmPassword?.message}
          isValid={Boolean(dirtyFields.confirmPassword) && !errors.confirmPassword}
          {...register('confirmPassword')}
        />

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}
        {done && !submitError && <p className="text-kiosk-base font-semibold text-kiosk-success">密碼已修改完成</p>}

        <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
          {submitting ? '送出中…' : '修改密碼'}
        </KioskButton>
      </form>
    </div>
  );
}
