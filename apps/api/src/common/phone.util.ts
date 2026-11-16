/**
 * 電話號碼統一格式：資料庫一律存「純數字」（例：0981675415），畫面顯示時才加 dash。
 * 後台輸入框會自動補 dash（0981-675-415）、LINE 自助建檔則是純數字，兩邊都要先經過這裡，
 * 否則同一支電話會因為寫法不同被當成兩個人。
 *
 * - 只留數字；+886 / 886 開頭轉回 0 開頭
 * - 空字串回 null
 */
export function normalizePhone(input: string | null | undefined): string {
  let digits = (input ?? '').replace(/\D/g, '');
  if (digits.startsWith('886') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  return digits;
}

/**
 * 比對用：純數字＋舊資料常見的 0000-000-000 寫法。
 * 正規化 migration 之後 DB 只會有純數字，保留 dash 寫法只是保險。
 */
export function phoneVariants(normalized: string): string[] {
  if (normalized.length !== 10) return [normalized];
  return [normalized, `${normalized.slice(0, 4)}-${normalized.slice(4, 7)}-${normalized.slice(7)}`];
}

/** 顯示用（PDF 等）：09XXXXXXXX → 09XX-XXX-XXX，其他格式原樣 */
export function formatPhoneDisplay(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return /^09\d{8}$/.test(phone) ? `${phone.slice(0, 4)}-${phone.slice(4, 7)}-${phone.slice(7)}` : phone;
}

/** 寫入 DB 用：正規化後為空則存 null */
export function normalizePhoneOrNull(input: string | null | undefined): string | null {
  const phone = normalizePhone(input);
  return phone || null;
}
