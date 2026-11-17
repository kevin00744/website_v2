'use client';

/** 是否從主畫面圖示開啟（全螢幕 App 模式，沒有 Safari 網址列） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** iPhone / iPad（iPadOS 13+ 的 Safari 會偽裝成 Mac，要靠觸控點數辨識） */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** 只有 iOS 的 Safari 能「加入主畫面」；Chrome / LINE 內建瀏覽器等不行 */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Line\/|FBAN|FBAV|Instagram/.test(ua);
}
