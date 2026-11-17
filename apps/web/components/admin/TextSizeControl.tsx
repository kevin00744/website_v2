'use client';

import { useEffect, useRef, useState } from 'react';
import { TEXT_SIZES, TEXT_SIZE_EVENT, getTextSize, setTextSize, type TextSize } from '@/lib/text-size';

/** 三格「A」按鈕，字由小到大；點了立即生效，記在這台裝置 */
export function TextSizeControl({ className = '' }: { className?: string }) {
  const [size, setSize] = useState<TextSize>('md');

  useEffect(() => {
    setSize(getTextSize());
    const onChange = () => setSize(getTextSize());
    window.addEventListener(TEXT_SIZE_EVENT, onChange);
    return () => window.removeEventListener(TEXT_SIZE_EVENT, onChange);
  }, []);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-semibold text-slate-600">文字大小</span>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="文字大小">
        {TEXT_SIZES.map((s, i) => {
          const active = size === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={s.label}
              onClick={() => setTextSize(s.id)}
              className={`flex h-11 items-center justify-center rounded-lg font-bold transition-all ${
                active ? 'bg-white text-kiosk-primary shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span style={{ fontSize: `${1 + i * 0.25}rem` }}>A</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 手機頂部列 / 登入頁用：一顆「Aa」按鈕，點開是小浮層 */
export function TextSizeButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="調整文字大小"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 min-w-[3rem] items-center justify-center rounded-kiosk px-2 text-lg font-bold text-slate-700 hover:bg-slate-100"
      >
        A<span className="text-sm">a</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <TextSizeControl />
        </div>
      )}
    </div>
  );
}
