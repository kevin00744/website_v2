'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  blob: Blob;
  name: string;
  onClose: () => void;
}

/**
 * 頁內全螢幕 PDF 檢視器（iPhone / iPad 用）。
 * iOS 的 <iframe> 不會捲動 PDF、通常只顯示第一頁，所以改用 pdf.js 把每一頁畫成 <canvas>，
 * 放在一般可捲動的容器裡，手指往下滑就能看完整份文件。
 */
export function PdfViewer({ blob, name, onClose }: Props) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let doc: { destroy: () => Promise<void> } | undefined;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        doc = pdf;
        if (cancelled) return;
        setPageCount(pdf.numPages);

        const container = pagesRef.current;
        if (!container) return;
        // 重新繪製前清空（例如開發模式 effect 跑兩次），避免留下畫到一半的空白頁
        container.replaceChildren();
        const width = Math.min(container.clientWidth - 24, 1000);
        const dpr = Math.min(window.devicePixelRatio || 1, 3);

        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return;
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(base.width * scale)}px`;
          canvas.style.height = `${Math.floor(base.height * scale)}px`;
          canvas.className = 'mx-auto mb-3 block bg-white shadow-md';
          canvas.setAttribute('aria-label', `第 ${n} 頁`);

          // 先畫完再放進畫面：被中斷的繪製不會留下空白頁
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
      } catch (e) {
        // 關閉檢視器時中斷的繪製不算錯誤
        if (cancelled) return;
        setError('這份文件無法在這裡顯示，請按「分享 / 儲存」用其他 App 開啟。');
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [blob]);

  // 開啟時鎖住背景捲動
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function share() {
    const file = new File([blob], `${name}.pdf`, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch {
      return; // 使用者取消分享
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-700" role="dialog" aria-modal="true" aria-label="PDF 檢視">
      <div className="pt-safe flex items-center justify-between gap-3 bg-white px-4 pb-2.5 shadow">
        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 min-h-[3rem] rounded-xl border-2 border-kiosk-primary px-5 text-lg font-bold text-kiosk-primary"
        >
          ✕ 關閉
        </button>
        <span className="mt-2.5 text-base font-semibold text-slate-600">{pageCount ? `共 ${pageCount} 頁` : '載入中…'}</span>
        <button
          type="button"
          onClick={() => void share()}
          className="mt-2.5 min-h-[3rem] rounded-xl bg-kiosk-primary px-5 text-lg font-bold text-white"
        >
          分享 / 儲存
        </button>
      </div>

      <div className="pb-safe flex-1 overflow-y-auto overscroll-contain px-3 pt-3" style={{ WebkitOverflowScrolling: 'touch' }} data-pdf-scroll>
        {error ? (
          <p className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-6 text-center text-lg text-slate-700">{error}</p>
        ) : (
          !pageCount && (
            <div className="mt-16 flex justify-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" aria-label="載入中" />
            </div>
          )
        )}
        <div ref={pagesRef} />
      </div>
    </div>
  );
}
