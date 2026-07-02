import { z } from 'zod';

/** 跟 index.ts 的 Role/Region 同一個值域，這裡不重新 export，避免跟 index.ts 的型別宣告撞名 */
type RoleValue = 'system_admin' | 'admin' | 'editor' | 'dealer' | 'manager';
type RegionValue = 'north' | 'central' | 'south';

/** system_admin 故意不在這裡——不能透過畫面指派出第二個系統管理員，後端 UsersService 也會擋（USER_ROLE_NOT_ASSIGNABLE） */
export const ASSIGNABLE_ROLES: { value: RoleValue; label: string }[] = [
  { value: 'admin', label: '管理員' },
  { value: 'editor', label: '編輯' },
  { value: 'dealer', label: '經銷商' },
  { value: 'manager', label: '店長' },
];

export const ROLE_LABEL: Record<RoleValue, string> = {
  system_admin: '系統管理員',
  admin: '管理員',
  editor: '編輯',
  dealer: '經銷商',
  manager: '店長',
};

export const userNameSchema = z.string().trim().min(1, '姓名不能空白').max(50, '姓名好像太長了，請確認一下');
export const userEmailSchema = z.string().trim().min(1, 'Email 不能空白').email('Email 格式不太對，請再檢查一次');
export const userPasswordSchema = z.string().min(8, '密碼至少要 8 個字元');

/**
 * 動態欄位連動防呆：role 選 manager 時 storeId 必填，role 選 dealer 時 region 必填，
 * 其他角色（admin/editor）這兩欄完全不會出現在畫面上，也不需要填。
 * 用 superRefine 而不是分開兩個 schema，是因為 role 是同一個表單裡的欄位，
 * 錨點（哪個欄位該標紅）要跟著 role 的選擇即時變動，schema 必須看得到完整的表單狀態才能判斷。
 */
export const createUserSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    password: userPasswordSchema,
    role: z.enum(['admin', 'editor', 'dealer', 'manager'], { errorMap: () => ({ message: '請選擇角色' }) }),
    storeId: z.number().optional(),
    region: z.enum(['north', 'central', 'south']).optional(),
    phone: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'manager' && !value.storeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '店長必須指定所屬分店', path: ['storeId'] });
    }
    if (value.role === 'dealer' && !value.region) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '經銷商必須指定負責區域', path: ['region'] });
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** 編輯帳號用：沒有密碼欄位（密碼修改走專屬的重設密碼功能，不跟基本資料編輯混在一起） */
export const updateUserSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    role: z.enum(['admin', 'editor', 'dealer', 'manager'], { errorMap: () => ({ message: '請選擇角色' }) }),
    storeId: z.number().optional(),
    region: z.enum(['north', 'central', 'south']).optional(),
    phone: z.string().trim().optional(),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'manager' && !value.storeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '店長必須指定所屬分店', path: ['storeId'] });
    }
    if (value.role === 'dealer' && !value.region) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '經銷商必須指定負責區域', path: ['region'] });
    }
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  newPassword: userPasswordSchema,
});
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

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  role: RoleValue;
  phone: string | null;
  storeId: number | null;
  storeName: string | null;
  region: RegionValue | null;
  isActive: boolean;
}
