export function formatSignedAt(value: string | null): string {
  if (!value) return '尚未簽署';
  return new Date(value).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
}

/** 一般日期顯示用（建立日期等一定有值的欄位），跟 formatSignedAt 分開是因為語意不同，不該共用「尚未簽署」這個 fallback */
export function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
}
