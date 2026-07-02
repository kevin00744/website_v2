import { z } from 'zod';

/**
 * 純前端表單驗證（格式錯誤在打字當下就能判斷），跟 customer.ts 裡其他 schema 同一套規則：
 * 帳號密碼是否正確只有後端知道，那種錯誤走 AppError -> 話術字典（AUTH_INVALID_CREDENTIALS）。
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, '請輸入帳號').email('Email 格式不太對，請再檢查一次'),
  password: z.string().min(1, '請輸入密碼'),
});

export type LoginInput = z.infer<typeof loginSchema>;
