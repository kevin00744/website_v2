'use client';

import { useState } from 'react';

interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
  onCancel?: () => void;
  title?: string;
  error?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✕'];

export function PinPad({ length = 4, onComplete, onCancel, title = '請輸入 PIN', error }: PinPadProps) {
  const [pin, setPin] = useState('');

  function handleKey(key: string) {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
    } else if (key === '✕') {
      setPin('');
      onCancel?.();
    } else if (pin.length < length) {
      const next = pin + key;
      setPin(next);
      if (next.length === length) {
        onComplete(next);
        setPin('');
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-kiosk-base font-semibold text-slate-700">{title}</p>
      <div className="flex gap-3">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border-2 transition-colors ${
              i < pin.length ? 'border-kiosk-primary bg-kiosk-primary' : 'border-slate-300 bg-white'
            }`}
          />
        ))}
      </div>
      {error && <p className="text-sm font-semibold text-kiosk-danger">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKey(key)}
            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold transition-colors ${
              key === '✕'
                ? 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                : key === '⌫'
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-50 text-slate-900 hover:bg-kiosk-primary/10 active:bg-kiosk-primary/20'
            }`}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
