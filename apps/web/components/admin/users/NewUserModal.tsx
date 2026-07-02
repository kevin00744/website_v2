'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  ASSIGNABLE_ROLES,
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type StoreSummary,
  type UpdateUserInput,
  type UserSummary,
} from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
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
  /** 有帶這個 prop 就是編輯模式（沒有密碼欄位），不帶就是新增模式 */
  editingUser?: UserSummary;
  /** dealer 開的時候鎖角色＝manager，不顯示角色下拉——對齊後端只允許 dealer 開店長帳號的限制 */
  lockedToManager?: boolean;
}

const REGION_OPTIONS = [
  { value: 'north', label: '北部' },
  { value: 'central', label: '中部' },
  { value: 'south', label: '南部' },
];

/** password 在 union 外面額外補一個 optional 欄位，純粹是讓 TS 不用為了一個只在新增模式出現的欄位寫一堆 cast */
type FormValues = (CreateUserInput | UpdateUserInput) & { password?: string };

/**
 * 置中大畫面（max-w-3xl）取代側欄，新增/編輯共用同一個 Modal，差別只是有沒有密碼欄位。
 *
 * 動態欄位連動防呆：選 manager 才出現「分店」下拉（必填），選 dealer 才出現「區域」下拉（必填），
 * 選 admin/editor 兩者都不顯示——用 react-hook-form 的 watch('role') 即時切換，不是送出後才知道錯。
 */
export function NewUserModal({ open, onClose, onSaved, editingUser, lockedToManager }: NewUserModalProps) {
  const isEditing = Boolean(editingUser);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [stores, setStores] = useState<StoreSummary[]>([]);

  useEffect(() => {
    if (!open) return;
    listStores()
      .then(setStores)
      .catch(() => setStores([]));
  }, [open]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    mode: 'onChange',
    defaultValues: editingUser
      ? {
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role === 'system_admin' ? 'admin' : editingUser.role,
          storeId: editingUser.storeId ?? undefined,
          region: editingUser.region ?? undefined,
          phone: editingUser.phone ?? '',
          isActive: editingUser.isActive,
        }
      : {
          name: '',
          email: '',
          password: '',
          role: lockedToManager ? 'manager' : undefined,
          storeId: undefined,
          region: undefined,
          phone: '',
        },
  });

  // editingUser 在開關 Modal 之間會換人，每次打開都要把表單重置成那個人的資料，不能沿用上一次殘留的值
  useEffect(() => {
    if (!open) return;
    reset(
      editingUser
        ? {
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role === 'system_admin' ? 'admin' : editingUser.role,
            storeId: editingUser.storeId ?? undefined,
            region: editingUser.region ?? undefined,
            phone: editingUser.phone ?? '',
            isActive: editingUser.isActive,
          }
        : {
            name: '',
            email: '',
            password: '',
            role: lockedToManager ? 'manager' : undefined,
            storeId: undefined,
            region: undefined,
            phone: '',
          },
    );
    setSubmitError(undefined);
  }, [open, editingUser, lockedToManager, reset]);

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
        {editingUser?.role === 'system_admin' && (
          <p className="rounded-kiosk bg-amber-50 px-4 py-3 text-kiosk-base text-amber-700">
            系統管理員帳號只能由本人自己修改，這裡的角色欄位已鎖定為管理員顯示，實際儲存時角色不會被更改。
          </p>
        )}
        <KioskInput
          label="姓名"
          required
          placeholder="請輸入姓名"
          errorMessage={errors.name?.message}
          isValid={Boolean(dirtyFields.name) && !errors.name}
          {...register('name')}
        />
        <KioskInput
          label="Email（登入帳號）"
          type="email"
          required
          placeholder="請輸入 Email"
          errorMessage={errors.email?.message}
          isValid={Boolean(dirtyFields.email) && !errors.email}
          {...register('email')}
        />
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
        {lockedToManager ? (
          <p className="rounded-kiosk bg-slate-50 px-4 py-3 text-kiosk-base text-slate-600">
            角色：店長（經銷商只能開立自己負責區域內的店長帳號）
          </p>
        ) : (
          <KioskSelect
            label="角色"
            required
            options={ASSIGNABLE_ROLES}
            placeholder="請選擇角色"
            disabled={editingUser?.role === 'system_admin'}
            errorMessage={errors.role?.message}
            isValid={Boolean(dirtyFields.role) && !errors.role}
            {...register('role')}
          />
        )}
        {role === 'manager' && (
          <KioskSelect
            label="所屬分店"
            required
            options={stores.map((store) => ({ value: String(store.id), label: `${store.code} ${store.name}` }))}
            placeholder="請選擇分店"
            errorMessage={errors.storeId?.message}
            isValid={Boolean(dirtyFields.storeId) && !errors.storeId}
            {...register('storeId', { valueAsNumber: true })}
          />
        )}
        {role === 'dealer' && (
          <KioskSelect
            label="負責區域"
            required
            options={REGION_OPTIONS}
            placeholder="請選擇區域"
            errorMessage={errors.region?.message}
            isValid={Boolean(dirtyFields.region) && !errors.region}
            {...register('region')}
          />
        )}
        <KioskInput
          label="電話"
          placeholder="請輸入電話（選填）"
          errorMessage={errors.phone?.message}
          isValid={Boolean(dirtyFields.phone) && !errors.phone}
          {...register('phone')}
        />

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
