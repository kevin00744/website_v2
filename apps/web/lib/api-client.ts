import { translateErrorCode } from '@website-v2/copy';
import { clearAuth, getAuthToken } from './auth';

/**
 * 外網連線會打不通的根因：NEXT_PUBLIC_API_BASE_URL 如果寫死成 http://localhost:3101/api/v2，
 * 對「在自己電腦上用 localhost 開發」的人來說沒問題，但訪客瀏覽器收到這串字串後，
 * localhost 永遠指向訪客自己的電腦，不是伺服器——所以外網使用者一律連不到 API，
 * 登入/聯絡表單等所有會打 API 的功能都會失敗。
 *
 * 改成「沒有顯式設定環境變數時，用目前瀏覽器網址列的 hostname（不管是 localhost、LAN IP、
 * 還是正式網域）+ API 容器對外的 3101 port」動態組出網址——這樣同一份 build 不管訪客是用
 * localhost、區網 IP 還是真實網域開站，都能正確打到同一台主機上的 API。
 */
// 故意每次呼叫都重新算（不快取成模組層級常數）：這個模組在 SSR 階段會先在伺服器端執行一次
// （這時 window 不存在），如果在那個時候就把值定下來，client 端 hydrate 後也會被卡住用伺服器算出來的值。
// 實際呼叫 API 一定是使用者互動/useEffect 觸發，那時候一定已經在瀏覽器環境，每次重算不會有效能問題。
export function resolveApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:3101/api/v2`;
  return 'http://localhost:3101/api/v2';
}

/**
 * 後端永遠只回 { code }（見 apps/api 的 HttpExceptionFilter），這裡負責轉成白話文，
 * 元件拿到的 .message 已經是門市人員看得懂的句子，不需要再自己判斷 code。
 */
export class ApiError extends Error {
  constructor(public readonly code: string, public readonly httpStatus: number) {
    super(translateErrorCode(code));
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  /** 檔案上傳用（multipart/form-data），瀏覽器會自動設好帶 boundary 的 Content-Type，這裡不要手動覆寫 */
  formData?: FormData;
  /** 只有 /auth/login 這種不需要帶 token 的請求才設 true */
  skipAuth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, formData, headers, skipAuth, ...rest } = options;
  const token = skipAuth ? undefined : getAuthToken();

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: formData ?? (json !== undefined ? JSON.stringify(json) : undefined),
  });

  if (!response.ok) {
    let code = 'DEFAULT';
    try {
      const body = await response.json();
      code = body?.code ?? 'DEFAULT';
    } catch {
      // 後端沒回 JSON（例如連不上線），維持 DEFAULT 通用提示
    }

    // 登入逾時/token 失效：清掉本機憑證並導回登入頁，不留在一個「看起來活著但其實打不動 API」的畫面
    if (response.status === 401 && !skipAuth && typeof window !== 'undefined') {
      clearAuth();
      window.location.href = '/login';
    }

    throw new ApiError(code, response.status);
  }

  // 後端有些 PATCH/DELETE 端點（如改密碼、刪除文章）回傳 void，NestJS 沒有明確設定 @HttpCode(204) 時
  // 還是會用 200 但帶空 body（Content-Length: 0），不是只有 204 才會沒有 body——直接呼叫 response.json()
  // 在這種情況下會丟出「Unexpected end of JSON input」，導致呼叫端的 catch 區塊把它當成失敗，即使後端
  // 其實已經成功處理了（這正是改密碼一直顯示失敗，但實際上密碼早就被改掉的原因）。
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * 給 PDF 這種二進位內容用：跟 apiRequest 一樣會帶 JWT Authorization header，
 * 差別只是回傳 Blob 不是 JSON。
 *
 * 為什麼不能直接 window.open(url, '_blank')：那是瀏覽器原生導覽，不會帶我們手動加的
 * Authorization header，後端的 JwtAuthGuard 收到沒有 token 的請求會直接 401，
 * 開出來的新分頁只會看到一段 JSON 錯誤訊息而不是 PDF。
 */
export async function apiRequestBlob(path: string): Promise<Blob> {
  const token = getAuthToken();
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    let code = 'DEFAULT';
    try {
      const body = await response.json();
      code = body?.code ?? 'DEFAULT';
    } catch {
      // PDF 端點出錯時後端一樣回 JSON（見 HttpExceptionFilter），抓不到就維持 DEFAULT
    }
    if (response.status === 401 && typeof window !== 'undefined') {
      clearAuth();
      window.location.href = '/login';
    }
    throw new ApiError(code, response.status);
  }

  return response.blob();
}
