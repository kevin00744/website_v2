'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  ALL_ASSIGNABLE_ROLES,
  CREATOR_CAN_ASSIGN,
  ROLE_LABEL,
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UserSummary,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { createUser, updateUser } from '@/lib/users-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';

interface NewUserModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (user: UserSummary) => void;
  editingUser?: UserSummary;
}

type FormValues = (CreateUserInput | UpdateUserInput) & { password?: string };

function getAssignableRoles(actorRole: AuthUser['role']) {
  if (actorRole === 'system_admin') return ALL_ASSIGNABLE_ROLES;
  const allowed = (CREATOR_CAN_ASSIGN as Record<string, string[]>)[actorRole] ?? [];
  return ALL_ASSIGNABLE_ROLES.filter((r) => allowed.includes(r.value));
}

export function NewUserModal({ open, onClose, onSaved, editingUser }: NewUserModalProps) {
  const isEditing = Boolean(editingUser);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [currentUser, setCurrentUser] = useState<AuthUser>();

  useEffect(() => {
    setCurrentUser(getAuthUser());
  }, []);

  const assignableRoles = getAssignableRoles(currentUser?.role ?? 'staff');
  const isSelf = editingUser?.id === currentUser?.id;
  const roleIsLocked = isSelf || editingUser?.role === 'system_admin';

  const makeDefaultValues = (user?: UserSummary) =>
    user
      ? {
          username: user.username,
          name: user.name,
          email: user.email ?? '',
          role: (user.role === 'system_admin' ? 'admin' : user.role) as 'admin' | 'manager' | 'accountant' | 'staff',
          phone: user.phone ?? '',
          isActive: user.isActive,
        }
      : {
          username: '',
          name: '',
          email: '',
          password: '',
          role: (assignableRoles[0]?.value ?? 'staff') as 'admin' | 'manager' | 'accountant' | 'staff',
          phone: '',
        };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    mode: 'onChange',
    defaultValues: makeDefaultValues(editingUser),
  });

  useEffect(() => {
    if (!open) return;
    reset(makeDefaultValues(editingUser));
    setSubmitError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingUser, reset]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const saved = editingUser
        ? await updateUser(editingUser.id, values as UpdateUserInput)
        : await createUser(values as CreateUserInput);
      onSaved(saved);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CenteredModal open={open} onClose={onClose} title={isEditing ? '編輯帳號' : '新增帳號'} maxWidthClassName="md:max-w-lg">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        {isSelf && (
          <p className="rounded-kiosk bg-amber-50 px-4 py-3 text-kiosk-base text-amber-700">
            您正在編輯自己的帳號。角色欄位已鎖定，無法自行變更角色。
          </p>
        )}
        {editingUser?.role === 'system_admin' && !isSelf && (
          <p className="rounded-kiosk bg-amber-50 px-4 py-3 text-kiosk-base text-amber-700">
            系統管理員帳號只能由本人管理，角色欄位已鎖定。
          </p>
        )}

        <KioskInput
          label="登入帳號 (username)"
          required
          placeholder="請輸入登入帳號"
          errorMessage={errors.username?.message}
          isValid={Boolean(dirtyFields.username) && !errors.username}
          {...register('username')}
        />
        <KioskInput
          label="姓名"
          required
          placeholder="請輸入姓名"
          errorMessage={errors.name?.message}
          isValid={Boolean(dirtyFields.name) && !errors.name}
          {...register('name')}
        />
        <KioskInput
          label="Email（選填：忘記密碼時使用）"
          type="email"
          placeholder="請輸入 Email（可不填）"
          errorMessage={errors.email?.message}
          isValid={Boolean(dirtyFields.email) && !errors.email}
          {...register('email')}
        />

        {!isEditing && (
          <KioskInput
            label="密碼"
            type="password"
            required
            placeholder="至少 4 個字元（可只用數字）"
            errorMessage={errors.password?.message}
            isValid={Boolean(dirtyFields.password) && !errors.password}
            {...register('password')}
          />
        )}

        {roleIsLocked ? (
          <div className="rounded-kiosk bg-slate-50 px-4 py-3 text-kiosk-base text-slate-600">
            角色：<span className="font-semibold">{(ROLE_LABEL as Record<string, string>)[editingUser?.role ?? 'staff'] ?? editingUser?.role}</span>
            <span className="ml-2 text-sm text-slate-400">（無法在此修改）</span>
          </div>
        ) : (
          <KioskSelect
            label="角色"
            required
            options={assignableRoles}
            placeholder="請選擇角色"
            errorMessage={errors.role?.message}
            isValid={Boolean(dirtyFields.role) && !errors.role}
            {...register('role')}
          />
        )}

        <KioskInput
          label="電話"
          placeholder="請輸入電話（選填）"
          errorMessage={errors.phone?.message}
          isValid={Boolean(dirtyFields.phone) && !errors.phone}
          {...register('phone')}
        />

        {isEditing && (
          <label className="flex cursor-pointer items-center gap-3 rounded-kiosk border border-slate-200 px-4 py-3">
            <input type="checkbox" className="h-5 w-5 accent-kiosk-primary" {...register('isActive')} />
            <span className="text-kiosk-base text-slate-700">帳號啟用中</span>
          </label>
        )}

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? '儲存中…' : isEditing ? '儲存修改' : '建立帳號'}
          </KioskButton>
          <KioskButton type="button" variant="ghost" fullWidth onClick={onClose} disabled={submitting}>
            取消
          </KioskButton>
        </div>
      </form>
    </CenteredModal>
  );
}
