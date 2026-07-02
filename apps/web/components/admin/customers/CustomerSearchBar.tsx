'use client';

import { useEffect, useState } from 'react';
import { useDebouncedValue } from '@/lib/use-debounce';

interface CustomerSearchBarProps {
  onSearch: (query: string) => void;
}

/** 巨大搜尋列，支援姓名/電話模糊搜尋，debounce 300ms 避免每打一個字就打一次 API。 */
export function CustomerSearchBar({ onSearch }: CustomerSearchBarProps) {
  const [input, setInput] = useState('');
  const debounced = useDebouncedValue(input, 300);

  useEffect(() => {
    onSearch(debounced.trim());
  }, [debounced, onSearch]);

  return (
    <div className="relative">
      <input
        type="search"
        inputMode="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="輸入姓名或電話查詢顧客"
        aria-label="搜尋顧客"
        className="min-h-kiosk w-full rounded-kiosk border-4 border-slate-300 bg-white px-6 text-kiosk-lg text-slate-900 outline-none transition-colors focus:border-kiosk-primary"
      />
      <span
        className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-2xl text-slate-400"
        aria-hidden="true"
      >
        🔍
      </span>
    </div>
  );
}
