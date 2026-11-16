/**
 * 建立 LINE 圖文選單（2×2）並設為預設選單。只需執行一次；重跑會建立新的選單並取代預設。
 *
 * 用法（在 apps/api 下）：
 *   LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_LIFF_ID=xxxx-xxxx npx ts-node scripts/line-richmenu.ts ./richmenu.png
 *
 * 圖片：2500×1686 的 PNG 或 JPEG（1MB 以內），切成四格：
 *   ┌────────────┬────────────┐
 *   │  線上預約    │ 會員綁定/我的資料 │
 *   ├────────────┼────────────┤
 *   │  剩餘堂數    │   儲值金      │
 *   └────────────┴────────────┘
 */
import { readFileSync } from 'fs';
import { extname } from 'path';

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const liffId = process.env.LINE_LIFF_ID;
const imagePath = process.argv[2];

if (!token || !liffId || !imagePath) {
  console.error('需要 LINE_CHANNEL_ACCESS_TOKEN、LINE_LIFF_ID 環境變數，以及圖片路徑參數');
  process.exit(1);
}

const W = 2500;
const H = 1686;
const halfW = W / 2;
const halfH = H / 2;
const liff = (path: string) => `https://liff.line.me/${liffId}/${path}`;

const richMenu = {
  size: { width: W, height: H },
  selected: true,
  name: 'member-menu-v1',
  chatBarText: '會員選單',
  areas: [
    { bounds: { x: 0, y: 0, width: halfW, height: halfH }, action: { type: 'uri', label: '線上預約', uri: liff('booking') } },
    { bounds: { x: halfW, y: 0, width: halfW, height: halfH }, action: { type: 'uri', label: '我的資料', uri: liff('me') } },
    { bounds: { x: 0, y: halfH, width: halfW, height: halfH }, action: { type: 'postback', label: '剩餘堂數', data: 'action=courses', displayText: '剩餘堂數' } },
    { bounds: { x: halfW, y: halfH, width: halfW, height: halfH }, action: { type: 'postback', label: '儲值金', data: 'action=wallet', displayText: '儲值金' } },
  ],
};

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const { richMenuId } = await call('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(richMenu),
  });
  console.log('建立選單：', richMenuId);

  const contentType = extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  await call(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: readFileSync(imagePath),
  });
  console.log('上傳圖片完成');

  await call(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST' });
  console.log('已設為預設選單');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
