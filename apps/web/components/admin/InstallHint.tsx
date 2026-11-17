'use client';

import { useEffect, useState } from 'react';
import { isIOS, isIOSSafari, isStandalone } from '@/lib/pwa';

const DISMISS_KEY = 'ui:installHintDismissed';

/**
 * iOS / iPadOS 的 Safari 分頁無法用程式隱藏網址列；
 * 「加入主畫面」後從圖示開啟才是全螢幕。這條提示教門市人員怎麼做，關掉後不再出現。
 */
export function InstallHint({ className = '' }: { className?: string }) {
  const [show, setShow] = useState(false);
  const [otherBrowser, setOtherBrowser] = useState(false);

  useEffect(() => {
    if (!isIOS() || isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* 讀不到就照常顯示 */
    }
    setOtherBrowser(!isIOSSafari());
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`flex items-start gap-4 rounded-2xl border border-kiosk-primary/20 bg-white p-4 shadow-sm ${className}`} role="note">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kiosk-primary/10 text-2xl" aria-hidden>
        📲
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-slate-900">加入主畫面，像 App 一樣全螢幕使用</p>
        {otherBrowser ? (
          <p className="mt-1 text-sm text-slate-700">請改用 Safari 開啟這個網址，再依照提示加入主畫面。</p>
        ) : (
          <p className="mt-1 text-sm text-slate-700">
            點右上角的
            <span className="mx-1 inline-flex h-7 items-center rounded-md bg-slate-100 px-1.5 align-middle" aria-label="分享">
              <ShareIcon />
            </span>
            分享 →「加入主畫面」，之後從主畫面的「璨妍後台」圖示開啟，就不會有網址列。
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-kiosk-primary hover:bg-kiosk-primary/10"
      >
        知道了
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" fill="none" aria-hidden>
      <path d="M8 1v10M8 1 4.5 4.5M8 1l3.5 3.5" stroke="#0f766e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-2" stroke="#0f766e" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
