import { AppError } from '../common/errors/app-error';

/**
 * LINE 整合設定，一律從環境變數讀取（每次呼叫即時讀，方便測試時覆寫 process.env）。
 * 測試期：LINE_ENABLED 預設關閉，必須明確設為 'true' 才會處理 webhook / LIFF 請求。
 */
export interface LineConfig {
  enabled: boolean;
  channelSecret: string;
  channelAccessToken: string;
  loginChannelId: string;
  liffId: string;
  storeId: number;
  botUsername: string;
}

export function readLineConfig(): LineConfig {
  return {
    enabled: process.env.LINE_ENABLED === 'true',
    channelSecret: process.env.LINE_CHANNEL_SECRET ?? '',
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
    loginChannelId: process.env.LINE_LOGIN_CHANNEL_ID ?? '',
    liffId: process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? '',
    storeId: Number(process.env.LINE_STORE_ID ?? 0),
    botUsername: process.env.LINE_BOT_USERNAME ?? 'line-bot',
  };
}

/** LIFF / 預約等需要完整設定的流程用：未開啟或未設定直接擋下 */
export function requireLineConfig(): LineConfig {
  const config = readLineConfig();
  if (!config.enabled) throw new AppError('LINE_DISABLED', 'LINE_ENABLED is not true', 503);
  if (!config.storeId) throw new AppError('LINE_NOT_CONFIGURED', 'LINE_STORE_ID missing', 503);
  return config;
}

/** LIFF 頁面網址：https://liff.line.me/<LIFF_ID>/<path> */
export function liffUrl(path: string): string {
  const { liffId } = readLineConfig();
  return `https://liff.line.me/${liffId}/${path.replace(/^\//, '')}`;
}
