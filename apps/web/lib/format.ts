export function formatSignedAt(value: string | null): string {
  if (!value) return '尚未簽署';
  return new Date(value).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
}

/** 一般日期顯示用（建立日期等一定有值的欄位），跟 formatSignedAt 分開是因為語意不同，不該共用「尚未簽署」這個 fallback */
export function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * 電話顯示用：資料庫一律存純數字（0981675415），畫面上加 dash → 0981-675-415。
 * 非 09 開頭 10 碼的號碼（市話等）原樣顯示。
 */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return /^09\d{8}$/.test(digits) ? `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}` : phone;
}
