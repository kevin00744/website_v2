import { apiRequestBlob } from './api-client';

/**
 * 開新分頁看 PDF：用帶 token 的 fetch 抓 Blob，再轉成 blob: URL 餵給新分頁。
 *
 * 一定要先同步呼叫 window.open('', '_blank')（在 await 之前），再等 fetch 完成才設定
 * location.href——如果整段都包在 async function 裡才呼叫 window.open，瀏覽器（尤其 Safari）
 * 會認為這次開新分頁已經脫離使用者點擊當下的呼叫堆疊，當成彈出視窗擋掉。
 */
export async function openPdfInNewTab(path: string): Promise<void> {
  const newTab = window.open('', '_blank');
  try {
    const blob = await apiRequestBlob(path);
    const blobUrl = URL.createObjectURL(blob);
    if (newTab) {
      newTab.location.href = blobUrl;
    } else {
      // 瀏覽器還是把它擋掉了（例如使用者關掉彈出視窗權限），退而求其次在目前分頁開
      window.location.href = blobUrl;
    }
  } catch (error) {
    newTab?.close();
    throw error;
  }
}
