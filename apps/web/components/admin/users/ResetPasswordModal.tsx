'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type ResetPasswordInput, type UserSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { resetUserPassword } from '@/lib/users-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

interface ResetPasswordModalProps {
  user: UserSummary;
  onClose: () => void;
  onDone: () => void;
}

/** 管理員強制重設別人的密碼，不需要驗證舊密碼——跟「自己改密碼」（settings 頁）是兩條故意分開的路徑 */
export function ResetPasswordModal({ user, onClose, onDone }: ResetPasswordModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
    defaultValues: { newPassword: '' },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await resetUserPassword(user.id, values.newPassword);
      setDone(true);
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '重設密碼失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open onClose={onClose} title={`重設「${user.name}」的密碼`} maxWidthClassName="md:max-w-md">
      {done ? (
        <div className="flex flex-1 flex-col gap-4">
          <p className="text-kiosk-base font-semibold text-kiosk-success">密碼已重設完成，請告知這位員工新密碼</p>
          <KioskButton variant="primary" fullWidth onClick={onDone}>
            完成
          </KioskButton>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
          <KioskInput
            label="新密碼"
            type="password"
            required
            placeholder="至少 4 個字元（可只用數字）"
            errorMessage={errors.newPassword?.message}
            isValid={Boolean(dirtyFields.newPassword) && !errors.newPassword}
            {...register('newPassword')}
          />
          {submitError && (
            <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
              ⚠️ {submitError}
            </p>
          )}
          <div className="mt-auto flex flex-col gap-3 pt-2">
            <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
              {submitting ? '重設中…' : '確認重設'}
            </KioskButton>
            <KioskButton type="button" variant="ghost" fullWidth onClick={onClose} disabled={submitting}>
              取消
            </KioskButton>
          </div>
        </form>
      )}
    </CenteredModal>
  );
}
