'use client';

/**
 * 文字大小切換（每台裝置各自記住）。
 * Tailwind 字級與間距都是 rem，所以只要改 <html> 的 font-size 就能整體縮放；
 * 實際的百分比寫在 globals.css 的 html[data-text-size] 規則裡。
 * layout.tsx 的 inline script 會在畫面繪製前先套用，避免閃動（見 TEXT_SIZE_BOOT_SCRIPT）。
 */

export type TextSize = 'md' | 'lg' | 'xl';

export const TEXT_SIZES: Array<{ id: TextSize; label: string; scale: number }> = [
  { id: 'md', label: '標準', scale: 1 },
  { id: 'lg', label: '大', scale: 1.125 },
  { id: 'xl', label: '特大', scale: 1.25 },
];

export const TEXT_SIZE_KEY = 'ui:textSize';
export const TEXT_SIZE_EVENT = 'textsizechange';

/** 給 layout.tsx 的 <script>：在 hydration 前讀 localStorage 並設定 data-text-size */
export const TEXT_SIZE_BOOT_SCRIPT = `try{var s=localStorage.getItem('${TEXT_SIZE_KEY}');if(s==='lg'||s==='xl'){document.documentElement.setAttribute('data-text-size',s)}}catch(e){}`;

export function getTextSize(): TextSize {
  if (typeof document === 'undefined') return 'md';
  const v = document.documentElement.getAttribute('data-text-size');
  return v === 'lg' || v === 'xl' ? v : 'md';
}

export function setTextSize(size: TextSize) {
  if (size === 'md') document.documentElement.removeAttribute('data-text-size');
  else document.documentElement.setAttribute('data-text-size', size);
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    /* 私密瀏覽等情況存不了，只影響這次瀏覽 */
  }
  window.dispatchEvent(new CustomEvent(TEXT_SIZE_EVENT, { detail: size }));
}

/** 目前根字級（px），用來把 rem 換算成像素（例如行事曆時段高度） */
export function rootFontPx(): number {
  if (typeof window === 'undefined') return 16;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}
