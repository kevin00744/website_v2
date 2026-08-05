import { z } from 'zod';

/**
 * 登入表單驗證：帳號 (username) + 密碼。
 * 帳號是否正確只有後端知道，格式錯誤（空白）在此判斷，認證失敗走 AUTH_INVALID_CREDENTIALS。
 */
export const loginSchema = z.object({
  username: z.string().trim().min(1, '請輸入帳號'),
  password: z.string().min(1, '請輸入密碼'),
});

export type LoginInput = z.infer<typeof loginSchema>;
