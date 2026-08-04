'use client';

import { useEffect, useState } from 'react';

interface PhotoLightboxProps {
  photos: string[];
  onClose: () => void;
}

export function PhotoLightbox({ photos, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, photos.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [photos, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full mx-4 flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 主圖 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[index]}
          alt={`照片 ${index + 1}`}
          className="max-h-[70vh] rounded object-contain"
        />

        {/* 上下頁 / 計數 */}
        {photos.length > 1 && (
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              className="px-4 py-2 rounded bg-white/20 text-white disabled:opacity-30 hover:bg-white/30"
            >
              ‹
            </button>
            <span className="text-white text-sm">{index + 1} / {photos.length}</span>
            <button
              type="button"
              disabled={index === photos.length - 1}
              onClick={() => setIndex((i) => i + 1)}
              className="px-4 py-2 rounded bg-white/20 text-white disabled:opacity-30 hover:bg-white/30"
            >
              ›
            </button>
          </div>
        )}

        {/* 縮圖列 */}
        {photos.length > 1 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {photos.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`w-14 h-14 rounded overflow-hidden border-2 transition-all ${i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-80'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* 關閉按鈕 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-2xl leading-none hover:text-slate-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
