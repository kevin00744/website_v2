import { io, type Socket } from 'socket.io-client';
import { getAuthToken } from './auth';
import { resolveApiBaseUrl } from './api-client';

let socket: Socket | undefined;

/** WebSocket 要連的是同一台主機的根網域 + /ws/chat namespace，不是 /api/v2 那段 REST 前綴——resolveApiBaseUrl() 已經會依目前瀏覽器網址動態算出正確的主機，這裡只是再去掉 REST 前綴 */
function resolveWsOrigin(): string {
  return resolveApiBaseUrl().replace(/\/api\/v2\/?$/, '');
}

/**
 * 整個 admin 區域共用同一條 WebSocket 連線（AdminShell 的收件箱圖示跟聊天視窗都拿同一個 instance），
 * 不要每打開一次聊天視窗就重新連線一次——後端的 handleConnection 只在「連線建立那一刻」
 * 自動加入 store/region room，重複連線只會浪費資源，也會讓 store room 的廣播收到多次。
 *
 * token 是連線當下的 auth payload，不會在連線期間自動更新——如果 token 換了（例如重新登入），
 * 呼叫端要自己呼叫 disconnectChatSocket() 讓下一次 getChatSocket() 用新 token 重新連線。
 */
export function getChatSocket(): Socket {
  if (socket) return socket;

  socket = io(`${resolveWsOrigin()}/ws/chat`, {
    // 用函式形式：每次（重新）連線都讀最新 token，access token 自動換新後不會卡在舊 token
    auth: (cb) => cb({ token: getAuthToken() }),
    transports: ['websocket'],
  });
  return socket;
}

export function disconnectChatSocket(): void {
  socket?.disconnect();
  socket = undefined;
}
