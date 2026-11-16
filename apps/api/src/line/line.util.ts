import { createHmac, timingSafeEqual } from 'crypto';

/** 驗證 LINE webhook 的 x-line-signature（HMAC-SHA256 + base64，以 channel secret 為 key） */
export function verifyLineSignature(rawBody: Buffer | string, signature: string | undefined, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * 手機號碼正規化：只留數字，+886 / 886 開頭轉回 0 開頭。
 * 資料庫裡的電話格式不一（0912-345-678、0912 345 678…），比對前兩邊都要先正規化。
 */
export { normalizePhone } from '../common/phone.util';

/** 台灣手機：09 開頭 10 碼 */
export function isValidMobile(phone: string): boolean {
  return /^09\d{8}$/.test(phone);
}

/** 姓名比對：去掉所有空白後完全一致 */
export function namesMatch(a: string, b: string): boolean {
  const clean = (s: string) => s.replace(/\s+/g, '');
  return clean(a) !== '' && clean(a) === clean(b);
}

/** 台北時間顯示：11/20（四）14:30 */
export function formatTaipei(date: Date): string {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday').replace('週', '').replace('星期', '');
  return `${get('month')}/${get('day')}（${weekday}）${get('hour')}:${get('minute')}`;
}
