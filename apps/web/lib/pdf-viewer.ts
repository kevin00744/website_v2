import { apiRequestBlob } from './api-client';
import { isIOS } from './pwa';

/**
 * 看 PDF：用帶 token 的 fetch 抓 Blob。
 *
 * - 電腦：轉成 blob: URL 開新分頁（瀏覽器內建 PDF 檢視器）。
 *   一定要先同步呼叫 window.open('', '_blank')（在 await 之前），再等 fetch 完成才設定
 *   location.href——否則瀏覽器（尤其 Safari）會當成彈出視窗擋掉。
 * - iPhone / iPad（不論 Safari 分頁或主畫面 App）：改開頁內檢視器（pdf.js 逐頁畫成 canvas）。
 *   主畫面模式下新分頁會被丟到另一個瀏覽器環境打不開 blob:；而 iframe 方式在 iOS 不能捲動、只顯示第一頁。
 */
export async function openPdfInNewTab(path: string): Promise<void> {
  if (isIOS()) {
    const blob = await apiRequestBlob(path);
    await showInlinePdfViewer(blob, path.split('/').filter(Boolean).slice(-2).join('-') || 'document');
    return;
  }

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

/**
 * 顯示已經拿到的 PDF Blob（例如同意書管理的草稿預覽，是 POST 回來的）：
 * iPhone / iPad 用頁內檢視器；電腦開新分頁。電腦端要在 await 之前先開分頁才不會被擋，
 * 所以呼叫端用 `openPdfFromRequest(() => apiRequestBlob(...))` 這個形式。
 */
export async function openPdfFromRequest(load: () => Promise<Blob>, name = 'document'): Promise<void> {
  if (isIOS()) {
    await showInlinePdfViewer(await load(), name);
    return;
  }
  const newTab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await load());
    if (newTab) newTab.location.href = url;
    else window.location.href = url;
  } catch (error) {
    newTab?.close();
    throw error;
  }
}

/** 掛一個獨立的 React root 顯示 PdfViewer，呼叫端不用自己放元件；關閉時 unmount */
async function showInlinePdfViewer(blob: Blob, name: string) {
  const [{ createRoot }, { createElement }, { PdfViewer }] = await Promise.all([
    import('react-dom/client'),
    import('react'),
    import('@/components/admin/PdfViewer'),
  ]);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = () => {
    root.unmount();
    host.remove();
  };
  root.render(createElement(PdfViewer, { blob, name, onClose: close }));
}
