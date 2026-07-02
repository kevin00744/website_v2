/**
 * 語意化錯誤：所有業務例外都丟這個，而不是裸的 Error 或 NestJS HttpException。
 * code 必須在 packages/copy/zh-TW.ts 裡有對應翻譯，否則前端會落到 DEFAULT 文案。
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}
