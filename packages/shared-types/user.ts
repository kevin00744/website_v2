import { z } from 'zod';

type RoleValue = 'system_admin' | 'general_agent' | 'admin' | 'editor' | 'dealer' | 'manager' | 'accountant' | 'staff';
type RegionValue = 'A' | 'B' | 'C';

export const ROLE_LABEL: Record<RoleValue, string> = {
  system_admin: '系統管理員',
  general_agent: '總代理',
  admin: '管理員',
  editor: '編輯',
  dealer: '區域代理',
  manager: '店長',
  accountant: '會計',
  staff: '服務人員',
};

export const REGION_LABEL: Record<RegionValue, string> = {
  A: '北部',
  B: '中部',
  C: '南部',
};

/**
 * 角色建立矩陣（前端用，與後端 CREATOR_ROLE_MATRIX 一致）。
 * system_admin 不在此列：後端直接放行，前端顯示完整選單。
 */
export const CREATOR_CAN_ASSIGN: Partial<Record<RoleValue, RoleValue[]>> = {
  general_agent: ['dealer'],
  dealer: ['manager', 'staff', 'accountant'],
  manager: ['staff', 'accountant'],
};

/** 所有可指派角色（含標籤），供 system_admin 使用完整清單 */
export const ALL_ASSIGNABLE_ROLES: { value: RoleValue; label: string }[] = [
  { value: 'general_agent', label: '總代理' },
  { value: 'admin', label: '管理員' },
  { value: 'dealer', label: '區域代理' },
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
export const userEmailSchema = z.string().trim().min(1, 'Email 不能空白').email('Email 格式不太對，請再檢查一次');
export const userPasswordSchema = z.string().min(8, '密碼至少要 8 個字元');

const roleEnum = z.enum(['general_agent', 'admin', 'editor', 'dealer', 'manager', 'accountant', 'staff'], {
  errorMap: () => ({ message: '請選擇角色' }),
});
const regionEnum = z.enum(['A', 'B', 'C']);

export const createUserSchema = z
  .object({
    username: userUsernameSchema,
    name: userNameSchema,
    email: userEmailSchema,
    password: userPasswordSchema,
    role: roleEnum,
    storeId: z.number().optional(),
    region: regionEnum.optional(),
    phone: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.role === 'manager' || value.role === 'staff' || value.role === 'accountant') && !value.storeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '此角色必須指定所屬分店', path: ['storeId'] });
    }
    if (value.role === 'dealer' && !value.region) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '代理商必須指定負責區域', path: ['region'] });
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    username: userUsernameSchema,
    name: userNameSchema,
    email: userEmailSchema,
    role: roleEnum,
    storeId: z.number().optional(),
    region: regionEnum.optional(),
    phone: z.string().trim().optional(),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if ((value.role === 'manager' || value.role === 'staff' || value.role === 'accountant') && !value.storeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '此角色必須指定所屬分店', path: ['storeId'] });
    }
    if (value.role === 'dealer' && !value.region) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '代理商必須指定負責區域', path: ['region'] });
    }
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
  password: z.string().min(8, '密碼至少要 8 個字元').optional(),
  phone: z.string().trim().optional(),
  name: z.string().trim().min(1, '姓名不能為空').optional(),
  email: z.string().trim().email('Email 格式不正確').optional(),
});
export type UpdateSelfInput = z.infer<typeof updateSelfSchema>;

export interface UserSummary {
  id: number;
  username: string;
  name: string;
  email: string;
  role: RoleValue;
  phone: string | null;
  storeId: number | null;
  storeName: string | null;
  region: RegionValue | null;
  isActive: boolean;
  dealerId: number | null;
  parentId: number | null;
}
