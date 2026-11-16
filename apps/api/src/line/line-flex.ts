import type { LineMessage } from './line-messaging.service';
import { formatTaipei, } from './line.util';
import { liffUrl } from './line.config';

/** Flex Message 產生器：剩餘堂數、儲值金、請先綁定、預約通知 */

const BRAND_COLOR = '#B08968';

export interface CourseSummary {
  name: string;
  remaining: number;
  total: number;
}

export interface WalletSummary {
  balance: number;
  bonusBalance: number;
  storeCredit: number;
}

const money = (n: number) => `NT$ ${Math.round(n).toLocaleString('en-US')}`;

function text(t: string, extra: Record<string, unknown> = {}) {
  return { type: 'text', text: t, wrap: true, ...extra };
}

function row(label: string, value: string, bold = false) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      text(label, { size: 'sm', color: '#555555', flex: 3 }),
      text(value, { size: 'sm', align: 'end', flex: 2, weight: bold ? 'bold' : 'regular', color: '#111111' }),
    ],
  };
}

function bubble(title: string, body: unknown[], footer?: unknown[]): Record<string, unknown> {
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: BRAND_COLOR,
      contents: [text(title, { color: '#FFFFFF', weight: 'bold', size: 'lg' })],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: body },
    ...(footer ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer } } : {}),
  };
}

function uriButton(label: string, uri: string, primary = true) {
  return {
    type: 'button',
    style: primary ? 'primary' : 'secondary',
    color: primary ? BRAND_COLOR : undefined,
    height: 'sm',
    action: { type: 'uri', label, uri },
  };
}

export function coursesMessage(customerName: string, courses: CourseSummary[]): LineMessage {
  const body =
    courses.length === 0
      ? [text('目前沒有剩餘的課程堂數', { size: 'sm', color: '#888888' })]
      : courses.map((c) => row(c.name, `${c.remaining} / ${c.total} 堂`, true));
  return {
    type: 'flex',
    altText: `${customerName} 的剩餘堂數`,
    contents: bubble(`${customerName} 的剩餘堂數`, [
      ...body,
      { type: 'separator' },
      text('顯示格式：剩餘 / 總堂數', { size: 'xs', color: '#999999' }),
    ], [uriButton('我要預約', liffUrl('booking'))]),
  };
}

export function walletMessage(customerName: string, wallet: WalletSummary): LineMessage {
  const total = wallet.balance + wallet.bonusBalance + wallet.storeCredit;
  return {
    type: 'flex',
    altText: `${customerName} 的儲值金餘額 ${money(total)}`,
    contents: bubble(`${customerName} 的儲值金`, [
      row('儲值金', money(wallet.balance)),
      row('贈送金', money(wallet.bonusBalance)),
      ...(wallet.storeCredit > 0 ? [row('購物金', money(wallet.storeCredit))] : []),
      { type: 'separator' },
      row('合計可用', money(total), true),
    ]),
  };
}

export function bindPromptMessage(): LineMessage {
  return {
    type: 'flex',
    altText: '請先完成會員綁定',
    contents: bubble('會員綁定', [
      text('查詢堂數、儲值金與線上預約前，請先綁定您的會員資料。', { size: 'sm' }),
      text('來過門市的貴賓請輸入當時留下的手機號碼；第一次光臨也可以直接建立資料。', { size: 'xs', color: '#888888' }),
    ], [uriButton('立即綁定', liffUrl('bind'))]),
  };
}

export function welcomeMessages(): LineMessage[] {
  return [
    { type: 'text', text: '歡迎加入！點選下方選單即可線上預約、查詢剩餘堂數與儲值金。' },
    bindPromptMessage(),
  ];
}

export function bookingLinkMessage(): LineMessage {
  return {
    type: 'flex',
    altText: '線上預約',
    contents: bubble('線上預約', [
      text('選擇項目與希望時段後送出，店家確認後會以 LINE 通知您。', { size: 'sm' }),
    ], [uriButton('開始預約', liffUrl('booking')), uriButton('我的預約', liffUrl('me'), false)]),
  };
}

export function helpMessage(): LineMessage {
  return {
    type: 'text',
    text: '請使用下方選單，或輸入：\n・預約\n・剩餘堂數\n・儲值金\n・綁定',
  };
}

/** 店家確認／取消預約時推播給顧客（預約送出當下不推播，只在網頁顯示） */
export function appointmentStatusMessage(
  status: 'confirmed' | 'cancelled',
  startAt: Date,
  serviceName: string | null,
  staffName: string | null = null,
): LineMessage {
  const title = { confirmed: '預約已確認', cancelled: '預約已取消' }[status];
  const hint = {
    confirmed: '期待您的光臨！如需更改請直接聯絡店家。',
    cancelled: '如有需要，歡迎重新預約。',
  }[status];
  return {
    type: 'flex',
    altText: `${title}：${formatTaipei(startAt)}`,
    contents: bubble(title, [
      row('時間', formatTaipei(startAt), true),
      row('項目', serviceName ?? '未指定'),
      ...(staffName ? [row('服務人員', staffName)] : []),
      { type: 'separator' },
      text(hint, { size: 'xs', color: '#888888' }),
    ], [uriButton('我的預約', liffUrl('me'), false)]),
  };
}
