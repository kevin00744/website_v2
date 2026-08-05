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
  type StoreSummary,
  type UpdateUserInput,
  type UserSummary,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { createUser, updateUser } from '@/lib/users-api';
import { listStores } from '@/lib/stores-api';
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

const REGION_OPTIONS = [
  { value: 'A', label: 'A - 北部' },
  { value: 'B', label: 'B - 中部' },
  { value: 'C', label: 'C - 南部' },
];

type FormValues = (CreateUserInput | UpdateUserInput) & { password?: string };

/**
 * 依當前登入者角色動態產生可選角色清單：
 * - system_admin：所有角色
 * - 其他：依 CREATOR_CAN_ASSIGN 矩陣
 */
function getAssignableRoles(actorRole: AuthUser['role']) {
  if (actorRole === 'system_admin') return ALL_ASSIGNABLE_ROLES;
  const allowed = CREATOR_CAN_ASSIGN[actorRole] ?? [];
  return ALL_ASSIGNABLE_ROLES.filter((r) => allowed.includes(r.value as never));
}

export function NewUserModal({ open, onClose, onSaved, editingUser }: NewUserModalProps) {
  const isEditing = Boolean(editingUser);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser>();

  useEffect(() => {
    setCurrentUser(getAuthUser());
  }, []);

  useEffect(() => {
    if (!open) return;
    listStores()
      .then(setStores)
      .catch(() => setStores([]));
  }, [open]);

  const assignableRoles = getAssignableRoles(currentUser?.role ?? 'staff');

  // 編輯自己的帳號時，角色欄位鎖定（任何人包括 system_admin 都不能自改 role）
  const isSelf = editingUser?.id === currentUser?.id;
  const roleIsLocked = isSelf || editingUser?.role === 'system_admin';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    mode: 'onChange',
    defaultValues: editingUser
      ? {
          username: editingUser.username,
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role === 'system_admin' ? 'admin' : (editingUser.role as never),
          storeId: editingUser.storeId ?? undefined,
          region: editingUser.region ?? undefined,
          phone: editingUser.phone ?? '',
          isActive: editingUser.isActive,
        }
      : {
          username: '',
          name: '',
          email: '',
          password: '',
          role: assignableRoles[0]?.value as never,
          storeId: undefined,
          region: undefined,
          phone: '',
        },
  });

  // manager 的 storeId 永遠鎖定為自己的分店
  const isManagerRole = currentUser?.role === 'manager';
  const lockedStoreId = isManagerRole ? (currentUser?.storeId ?? undefined) : undefined;

  // 總代理建立代理帳號時，區域鎖定為自己的區域
  const isGeneralAgent = currentUser?.role === 'general_agent';
  const lockedRegion = isGeneralAgent ? (currentUser?.region ?? undefined) : undefined;

  useEffect(() => {
    if (!open) return;
    reset(
      editingUser
        ? {
            username: editingUser.username,
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role === 'system_admin' ? 'admin' : (editingUser.role as never),
            storeId: editingUser.storeId ?? undefined,
            region: editingUser.region ?? undefined,
            phone: editingUser.phone ?? '',
            isActive: editingUser.isActive,
          }
        : {
            username: '',
            name: '',
            email: '',
            password: '',
            role: assignableRoles[0]?.value as never,
            storeId: lockedStoreId,
            region: lockedRegion,
            phone: '',
          },
    );
    setSubmitError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingUser, reset]);

  const role = watch('role');

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
    <CenteredModal open={open} onClose={onClose} title={isEditing ? '編輯帳號' : '新增帳號'} maxWidthClassName="md:max-w-3xl">
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

        {/* 帳號 (username) */}
        <KioskInput
          label="登入帳號 (username)"
          required
          placeholder="請輸入登入帳號"
          errorMessage={errors.username?.message}
          isValid={Boolean(dirtyFields.username) && !errors.username}
          {...register('username')}
        />

        {/* 姓名 */}
        <KioskInput
          label="姓名"
          required
          placeholder="請輸入姓名"
          errorMessage={errors.name?.message}
          isValid={Boolean(dirtyFields.name) && !errors.name}
          {...register('name')}
        />

        {/* Email（備用，不用來登入） */}
        <KioskInput
          label="Email（備用：忘記密碼時使用）"
          type="email"
          required
          placeholder="請輸入 Email"
          errorMessage={errors.email?.message}
          isValid={Boolean(dirtyFields.email) && !errors.email}
          {...register('email')}
        />

        {/* 密碼（新增模式才顯示） */}
        {!isEditing && (
          <KioskInput
            label="密碼"
            type="password"
            required
            placeholder="至少 8 個字元"
            errorMessage={errors.password?.message}
            isValid={Boolean(dirtyFields.password) && !errors.password}
            {...register('password')}
          />
        )}

        {/* 角色選單：鎖定條件 → 自己 or system_admin 帳號 */}
        {roleIsLocked ? (
          <div className="rounded-kiosk bg-slate-50 px-4 py-3 text-kiosk-base text-slate-600">
            角色：<span className="font-semibold">{ROLE_LABEL[editingUser?.role ?? 'staff']}</span>
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

        {/* 分店（manager / staff / accountant 必填）：manager 自動鎖定自己的分店 */}
        {(role === 'manager' || role === 'staff' || role === 'accountant') && (
          isManagerRole ? (
            <div className="rounded-kiosk bg-slate-50 px-4 py-3 text-kiosk-base text-slate-600">
              所屬分店：
              <span className="font-semibold">
                {stores.find((s) => s.id === lockedStoreId)
                  ? `${stores.find((s) => s.id === lockedStoreId)!.code} ${stores.find((s) => s.id === lockedStoreId)!.name}`
                  : `分店 #${lockedStoreId}`}
              </span>
              <span className="ml-2 text-sm text-slate-400">（自動指定，不可更改）</span>
            </div>
          ) : (
            <KioskSelect
              label="所屬分店"
              required
              options={stores.map((store) => ({ value: String(store.id), label: `${store.code} ${store.name}` }))}
              placeholder="請選擇分店"
              errorMessage={errors.storeId?.message}
              isValid={Boolean(dirtyFields.storeId) && !errors.storeId}
              {...register('storeId', { valueAsNumber: true })}
            />
          )
        )}

        {/* 區域（dealer / general_agent 必填）：總代理建立代理時鎖定為自己的區域 */}
        {(role === 'dealer' || role === 'general_agent') && (
          isGeneralAgent && role === 'dealer' ? (
            <div className="rounded-kiosk bg-slate-50 px-4 py-3 text-kiosk-base text-slate-600">
              負責區域：
              <span className="font-semibold">
                {REGION_OPTIONS.find((r) => r.value === lockedRegion)?.label ?? lockedRegion}
              </span>
              <span className="ml-2 text-sm text-slate-400">（自動指定為您的區域，不可更改）</span>
            </div>
          ) : (
            <KioskSelect
              label="負責區域"
              required
              options={REGION_OPTIONS}
              placeholder="請選擇區域"
              errorMessage={errors.region?.message}
              isValid={Boolean(dirtyFields.region) && !errors.region}
              {...register('region')}
            />
          )
        )}

        {/* 電話 */}
        <KioskInput
          label="電話"
          placeholder="請輸入電話（選填）"
          errorMessage={errors.phone?.message}
          isValid={Boolean(dirtyFields.phone) && !errors.phone}
          {...register('phone')}
        />

        {/* 啟用/停用（編輯模式） */}
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
