import { z } from 'zod';

export type RoleValue = 'system_admin' | 'admin' | 'manager' | 'accountant' | 'staff';

export const ROLE_LABEL: Record<RoleValue, string> = {
  system_admin: '系統管理員',
  admin: '管理員',
  manager: '店長',
  accountant: '會計',
  staff: '服務人員',
};

/**
 * 帳號建立矩陣（前端用，與後端 CREATOR_ROLE_MATRIX 一致）。
 * system_admin/admin 可建立所有角色，前端直接顯示完整選單。
 */
export const CREATOR_CAN_ASSIGN: Partial<Record<RoleValue, RoleValue[]>> = {
  manager: ['accountant', 'staff'],
};

/** 所有可指派角色（供帳號管理頁使用） */
export const ALL_ASSIGNABLE_ROLES: { value: RoleValue; label: string }[] = [
  { value: 'admin', label: '管理員' },
  { value: 'manager', label: '店長' },
  { value: 'accountant', label: '會計' },
  { value: 'staff', label: '服務人員' },
];

export const userUsernameSchema = z
  .string()
  .trim()
  .min(1, '帳號不能空白')
  .max(50, '帳號太長了，請確認一下')
  .regex(/^[a-zA-Z0-9_@.]+$/, '帳號只能包含英數字、底線、@ 和小數點');

export const userNameSchema = z.string().trim().min(1, '姓名不能空白').max(50, '姓名好像太長了，請確認一下');
export const userEmailSchema = z.string().trim().email('Email 格式不太對，請再檢查一次').optional().or(z.literal(''));
export const userPasswordSchema = z.string().min(8, '密碼至少要 8 個字元');

const roleEnum = z.enum(['admin', 'manager', 'accountant', 'staff'], {
  errorMap: () => ({ message: '請選擇角色' }),
});

export const createUserSchema = z.object({
  username: userUsernameSchema,
  name: userNameSchema,
  email: z.string().trim().email('Email 格式不太對，請再檢查一次').optional().or(z.literal('')),
  password: userPasswordSchema,
  role: roleEnum,
  storeId: z.number().optional(),
  phone: z.string().trim().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  username: userUsernameSchema,
  name: userNameSchema,
  email: z.string().trim().email('Email 格式不太對，請再檢查一次').optional().or(z.literal('')),
  role: roleEnum,
  storeId: z.number().optional(),
  phone: z.string().trim().optional(),
  isActive: z.boolean(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ newPassword: userPasswordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, '請輸入原密碼'),
    newPassword: userPasswordSchema,
    confirmPassword: z.string().min(1, '請再輸入一次新密碼'),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '兩次輸入的新密碼不一致', path: ['confirmPassword'] });
    }
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateSelfSchema = z.object({
  username: userUsernameSchema.optional(),
  password: z.string().min(8, '密碼至少 8 個字元').optional(),
  phone: z.string().trim().optional(),
  name: z.string().trim().min(1, '姓名不能為空').optional(),
  email: z.string().trim().email('Email 格式不正確').optional(),
});
export type UpdateSelfInput = z.infer<typeof updateSelfSchema>;

export interface UserSummary {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: RoleValue;
  phone: string | null;
  storeId: number | null;
  storeName: string | null;
  isActive: boolean;
  parentId: number | null;
  creatorName: string | null;
}
